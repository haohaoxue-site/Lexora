#![cfg(target_os = "linux")]

use lexora_buddy_host::process_control::{ProcessError, run};
use serde_json::{Value, json};
use std::{
    process::{Child, Command},
    thread,
    time::Duration,
};

struct Fixture(Child);

impl Fixture {
    fn new(ignore_term: bool) -> Self {
        let child = if ignore_term {
            Command::new("/bin/sh")
                .args(["-c", "trap '' TERM; exec /usr/bin/sleep 30"])
                .spawn()
                .unwrap()
        } else {
            Command::new("/usr/bin/sleep").arg("30").spawn().unwrap()
        };
        let fixture = Self(child);
        for _ in 0..100 {
            if std::fs::read_link(format!("/proc/{}/exe", fixture.0.id()))
                .is_ok_and(|path| path.ends_with("sleep"))
            {
                return fixture;
            }
            thread::sleep(Duration::from_millis(10));
        }
        panic!("fixture did not start");
    }

    fn target(&self) -> Value {
        request(json!({"operation":"read", "pid":self.0.id(), "protectedPids":[]})).unwrap()[0]
            .clone()
    }

    fn action(
        &self,
        target: &Value,
        action: &str,
        protected: Vec<u32>,
    ) -> Result<Value, ProcessError> {
        request(
            json!({"operation":"execute", "pid":self.0.id(), "instanceId":target["instanceId"], "executable":target["executable"], "action":action, "protectedPids":protected}),
        )
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn request(value: Value) -> Result<Value, ProcessError> {
    let mut output = Vec::new();
    run(serde_json::to_vec(&value).unwrap().as_slice(), &mut output)?;
    Ok(serde_json::from_slice(&output).unwrap())
}

#[test]
fn pins_identity_and_rechecks_protection_before_signalling() {
    let mut fixture = Fixture::new(false);
    let target = fixture.target();
    assert_eq!(target["pid"], fixture.0.id());
    assert_eq!(
        target["allowedActions"],
        json!(["terminate-process", "kill-process"])
    );
    assert!(target["startedAt"].as_str().unwrap().ends_with('Z'));
    let mut replaced = target.clone();
    replaced["instanceId"] = json!("0");
    assert_eq!(
        fixture.action(&replaced, "kill-process", vec![]),
        Err(ProcessError::TargetChanged)
    );
    replaced = target.clone();
    replaced["executable"] = json!("/different");
    assert_eq!(
        fixture.action(&replaced, "kill-process", vec![]),
        Err(ProcessError::TargetChanged)
    );
    assert_eq!(
        fixture.action(&target, "kill-process", vec![fixture.0.id()]),
        Err(ProcessError::NotAllowed)
    );
    assert!(fixture.0.try_wait().unwrap().is_none());
    fixture
        .action(&target, "terminate-process", vec![])
        .unwrap();
    fixture.0.wait().unwrap();
    assert_eq!(
        request(json!({"operation":"read", "pid":fixture.0.id(), "protectedPids":[]})).unwrap(),
        json!([])
    );
}

#[test]
fn graceful_termination_never_escalates_without_an_explicit_action() {
    let mut fixture = Fixture::new(true);
    let target = fixture.target();
    fixture
        .action(&target, "terminate-process", vec![])
        .unwrap();
    assert!(fixture.0.try_wait().unwrap().is_none());
    fixture.action(&target, "kill-process", vec![]).unwrap();
    fixture.0.wait().unwrap();
}

#[test]
fn caller_and_ancestors_are_read_only() {
    let result = request(
        json!({"operation":"resolve", "selector":{"pid":std::process::id()}, "protectedPids":[]}),
    )
    .unwrap();
    assert_eq!(result[0]["allowedActions"], json!([]));
}
