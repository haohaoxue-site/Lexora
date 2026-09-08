use super::*;

#[test]
fn freshly_created_policy_has_private_owner_and_inheritable_acl() {
    let security = PrivateSecurity::new().unwrap();
    assert_eq!(security.validate_descriptor(&security.descriptor), Ok(()));
}

#[test]
fn rejects_null_dacl_untrusted_owner_and_allow_ace_variants_not_in_contract() {
    let security = PrivateSecurity::new().unwrap();
    for sddl in [
        "O:SYD:NO_ACCESS_CONTROL",
        "O:WDD:P(A;;FA;;;SY)",
        "O:SYD:P(A;;FR;;;WD)",
        "O:SYD:P(A;OICIIO;FR;;;WD)",
        r#"O:SYD:P(XA;;FR;;;WD;(@User.Title=="PM"))"#,
    ] {
        let descriptor = from_sddl(sddl).unwrap_or_else(|error| panic!("{sddl}: {error}"));
        assert_eq!(
            security.validate_descriptor(&descriptor),
            Err(DirectoryError::Unsafe),
            "{sddl}"
        );
    }
}

#[test]
fn empty_acl_and_deny_entries_do_not_grant_untrusted_access() {
    let security = PrivateSecurity::new().unwrap();
    for sddl in ["O:SYD:P", "O:SYD:P(D;;FA;;;WD)(A;;FA;;;SY)(A;;FA;;;BA)"] {
        assert_eq!(
            security.validate_descriptor(&from_sddl(sddl).unwrap()),
            Ok(()),
            "{sddl}"
        );
    }
}
