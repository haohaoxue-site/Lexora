use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::GetKernelObjectSecurity;

use super::*;

fn snapshot(file: &File) -> String {
    let mut storage = vec![0usize; 16384];
    let mut needed = 0;
    // SAFETY: The aligned buffer has its declared byte capacity and the fixture handle is live.
    boolean(unsafe {
        GetKernelObjectSecurity(
            file.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            storage.as_mut_ptr().cast(),
            (storage.len() * size_of::<usize>()) as u32,
            &mut needed,
        )
    })
    .unwrap();
    let mut text = ptr::null_mut();
    let mut length = 0;
    // SAFETY: The API receives a live descriptor and returns an owned, length-delimited UTF-16 string.
    boolean(unsafe {
        ConvertSecurityDescriptorToStringSecurityDescriptorW(
            storage.as_mut_ptr().cast(),
            SDDL_REVISION_1,
            DACL_SECURITY_INFORMATION,
            &mut text,
            &mut length,
        )
    })
    .unwrap();
    let _text = LocalMemory(text.cast());
    // SAFETY: The returned buffer has the declared length and remains live during this bounded scan.
    let units = unsafe { std::slice::from_raw_parts(text, length as usize) };
    let end = units.iter().position(|unit| *unit == 0).unwrap();
    String::from_utf16(&units[..end]).unwrap()
}

#[test]
fn temporary_grants_preserve_legacy_explicit_entries_matching_the_parent() {
    let directory = tempfile::tempdir().unwrap();
    let parent = open_path(directory.path().to_str().unwrap()).unwrap();
    let user = sid_text(&process_user_sid(current_process()).unwrap()).unwrap();
    let legacy = format!("D:(A;OICI;FA;;;{user})");
    let descriptor = SecurityDescriptor::new(&legacy).unwrap();
    let child_path = directory.path().join("child");
    // SAFETY: Only the synthetic parent and child receive this fixture-owned descriptor.
    unsafe {
        boolean(SetKernelObjectSecurity(
            parent.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            descriptor.as_ptr(),
        ))
        .unwrap();
    }
    fs::create_dir(&child_path).unwrap();
    let child = open_path(child_path.to_str().unwrap()).unwrap();
    // SAFETY: The live child belongs exclusively to this fixture.
    unsafe {
        boolean(SetKernelObjectSecurity(
            child.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            descriptor.as_ptr(),
        ))
        .unwrap();
    }
    let original = snapshot(&parent);
    assert_eq!(snapshot(&child), original);
    let profile = Profile::create().unwrap();
    change_acl(&child, &profile.sid, FILE_GENERIC_READ, GRANT_ACCESS, true).unwrap();
    change_acl(&child, &profile.sid, 0, REVOKE_ACCESS, false).unwrap();
    assert_eq!(snapshot(&child), original);
    assert_eq!(snapshot(&parent), original);
}

#[test]
fn temporary_grants_preserve_inheritance_control_without_propagating_to_children() {
    let directory = tempfile::tempdir().unwrap();
    let root = open_path(directory.path().to_str().unwrap()).unwrap();
    let user = sid_text(&process_user_sid(current_process()).unwrap()).unwrap();
    let descriptor = SecurityDescriptor::new(&format!("D:PAI(A;OICI;FA;;;{user})")).unwrap();
    // SAFETY: The descriptor is private to this synthetic directory; no system or user ACL is changed.
    unsafe {
        boolean(SetSecurityDescriptorControl(
            descriptor.as_ptr(),
            SE_DACL_AUTO_INHERIT_REQ,
            SE_DACL_AUTO_INHERIT_REQ,
        ))
        .unwrap();
        boolean(SetKernelObjectSecurity(
            root.as_raw_handle(),
            DACL_SECURITY_INFORMATION,
            descriptor.as_ptr(),
        ))
        .unwrap();
    }
    let before = snapshot(&root);
    assert!(before.starts_with("D:PAI"), "{before}");
    let child_path = directory.path().join("child");
    fs::create_dir(&child_path).unwrap();
    let child = open_path(child_path.to_str().unwrap()).unwrap();
    let child_before = snapshot(&child);
    let profile = Profile::create().unwrap();
    change_acl(&root, &profile.sid, FILE_GENERIC_READ, GRANT_ACCESS, true).unwrap();
    assert!(snapshot(&root).starts_with("D:PAI"));
    assert_eq!(snapshot(&child), child_before);
    change_acl(&root, &profile.sid, 0, REVOKE_ACCESS, false).unwrap();
    assert_eq!(snapshot(&root), before);
    assert_eq!(snapshot(&child), child_before);
}
