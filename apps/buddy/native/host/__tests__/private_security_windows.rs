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
        "O:SYD:P(A;OICI;FA;;;CO)",
        "O:SYD:P(A;OICIIO;FA;;;CG)",
        "O:COD:P(A;OICIIO;FA;;;CO)",
        r#"O:SYD:P(XA;;FR;;;WD;(@User.Title=="PM"))"#,
    ] {
        let descriptor = from_sddl(sddl).unwrap_or_else(|error| panic!("{sddl}: {error}"));
        assert_eq!(
            security.validate_descriptor(&descriptor),
            Err(DirectoryFailure::new(
                DirectoryError::Unsafe,
                DirectoryOperation::ValidateAcl
            )),
            "{sddl}"
        );
    }
}

#[test]
fn creator_owner_inherit_only_template_does_not_grant_access_to_other_users() {
    let security = PrivateSecurity::new().unwrap();
    for sddl in [
        "O:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICIIO;FA;;;CO)",
        "O:BAD:(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIIOID;FA;;;CO)",
    ] {
        assert_eq!(
            security.validate_descriptor(&from_sddl(sddl).unwrap()),
            Ok(()),
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

#[test]
fn metadata_only_grants_do_not_expose_directory_contents_or_allow_changes() {
    let security = PrivateSecurity::new().unwrap();
    for sid in ["WD", "BU", "AC", "S-1-5-21-1-2-3-1001"] {
        for mask in [
            0,
            FILE_READ_ATTRIBUTES,
            READ_CONTROL,
            SYNCHRONIZE,
            METADATA_READ_ACCESS,
        ] {
            for flags in ["", "OICI", "OICIIO", "OICIID"] {
                let sddl = format!("O:SYD:P(A;OICI;FA;;;SY)(A;{flags};{mask:#x};;;{sid})");
                assert_eq!(
                    security.validate_descriptor(&from_sddl(&sddl).unwrap()),
                    Ok(()),
                    "{sddl}"
                );
            }
        }
    }
}

#[test]
fn metadata_grants_do_not_hide_data_access_changes_or_unknown_rights() {
    let security = PrivateSecurity::new().unwrap();
    for bit in 0..32 {
        let access = 1_u32 << bit;
        if access & METADATA_READ_ACCESS != 0 {
            continue;
        }
        for flags in ["", "OICIIO"] {
            let mask = access | METADATA_READ_ACCESS;
            let sddl = format!("O:SYD:P(A;OICI;FA;;;SY)(A;{flags};{mask:#x};;;WD)");
            assert_eq!(
                security.validate_descriptor(&from_sddl(&sddl).unwrap()),
                Err(DirectoryFailure::new(
                    DirectoryError::Unsafe,
                    DirectoryOperation::ValidateAcl
                )),
                "{sddl}"
            );
        }
    }
}
