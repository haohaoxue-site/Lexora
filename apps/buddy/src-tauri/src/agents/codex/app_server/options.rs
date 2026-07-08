use std::path::Path;

use crate::{
    agents::codex::{
        CodexModelOption, CodexModelServiceTier, CodexPromptContextOption,
        CodexPromptContextOptions, CodexReasoningEffortOption,
    },
    error::BuddyResult,
};

use super::{
    requests::{
        build_app_server_fuzzy_file_search_request, build_app_server_initialize_request,
        build_app_server_initialized_notification, build_app_server_model_list_request,
        build_app_server_plugin_installed_request, build_app_server_skills_list_request,
    },
    rpc::read_app_server_response,
    transport::CodexAppServerTransport,
};

pub(super) fn load_codex_prompt_context_options(
    cwd: &str,
    file_query: Option<&str>,
) -> BuddyResult<CodexPromptContextOptions> {
    load_codex_prompt_context_options_with_program(Path::new("codex"), cwd, file_query)
}

pub(super) fn load_codex_model_options() -> BuddyResult<Vec<CodexModelOption>> {
    load_codex_model_options_with_program(Path::new("codex"))
}

fn load_codex_model_options_with_program(program: &Path) -> BuddyResult<Vec<CodexModelOption>> {
    let mut transport = CodexAppServerTransport::spawn(program)?;

    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    transport.send(build_app_server_initialized_notification())?;

    let mut request_id = 1;
    let mut cursor = None;
    let mut models = Vec::new();
    loop {
        transport.send(build_app_server_model_list_request(
            request_id,
            cursor.as_deref(),
        ))?;
        let result = read_app_server_response(&mut transport, request_id)?;
        models.extend(extract_codex_model_options(&result));
        cursor = result
            .get("nextCursor")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        if cursor.is_none() {
            break;
        }

        request_id += 1;
    }

    transport.close();

    Ok(models)
}

fn load_codex_prompt_context_options_with_program(
    program: &Path,
    cwd: &str,
    file_query: Option<&str>,
) -> BuddyResult<CodexPromptContextOptions> {
    let mut transport = CodexAppServerTransport::spawn(program)?;

    transport.send(build_app_server_initialize_request(0))?;
    read_app_server_response(&mut transport, 0)?;
    transport.send(build_app_server_initialized_notification())?;

    transport.send(build_app_server_skills_list_request(1, cwd))?;
    let skills_result = read_app_server_response(&mut transport, 1)?;
    transport.send(build_app_server_plugin_installed_request(2, cwd))?;
    let plugins_result = read_app_server_response(&mut transport, 2)?;

    let files_result = if file_query
        .map(str::trim)
        .is_some_and(|query| !query.is_empty())
    {
        transport.send(build_app_server_fuzzy_file_search_request(
            3,
            cwd,
            file_query.unwrap_or_default(),
        ))?;
        Some(read_app_server_response(&mut transport, 3)?)
    } else {
        None
    };

    transport.close();

    Ok(CodexPromptContextOptions {
        files: files_result
            .as_ref()
            .map(|value| extract_prompt_context_files(value, cwd))
            .unwrap_or_default(),
        plugins: extract_prompt_context_plugins(&plugins_result),
        skills: extract_prompt_context_skills(&skills_result),
    })
}

fn extract_codex_model_options(value: &serde_json::Value) -> Vec<CodexModelOption> {
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter(|model| {
            !model
                .get("hidden")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|model| {
            let model_id = read_json_string(model, "id")?;
            let model_value = read_json_string(model, "model").unwrap_or_else(|| model_id.clone());
            let display_name =
                read_json_string(model, "displayName").unwrap_or_else(|| model_value.clone());

            Some(CodexModelOption {
                runtime: "codex",
                default_reasoning_effort: read_json_string(model, "defaultReasoningEffort"),
                default_service_tier: read_json_string(model, "defaultServiceTier"),
                description: read_json_string(model, "description"),
                display_name,
                id: model_id,
                is_default: model
                    .get("isDefault")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                model: model_value,
                service_tiers: extract_codex_model_service_tiers(model),
                supported_reasoning_efforts: extract_codex_reasoning_effort_options(model),
            })
        })
        .collect()
}

fn extract_codex_reasoning_effort_options(
    model: &serde_json::Value,
) -> Vec<CodexReasoningEffortOption> {
    model
        .get("supportedReasoningEfforts")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|option| {
            let reasoning_effort = option
                .as_str()
                .map(str::to_owned)
                .or_else(|| read_json_string(option, "reasoningEffort"))?;

            Some(CodexReasoningEffortOption {
                description: read_json_string(option, "description"),
                reasoning_effort,
            })
        })
        .collect()
}

fn extract_codex_model_service_tiers(model: &serde_json::Value) -> Vec<CodexModelServiceTier> {
    model
        .get("serviceTiers")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tier| {
            let id = read_json_string(tier, "id")?;
            Some(CodexModelServiceTier {
                description: read_json_string(tier, "description"),
                name: read_json_string(tier, "name").unwrap_or_else(|| id.clone()),
                id,
            })
        })
        .collect()
}

fn extract_prompt_context_skills(value: &serde_json::Value) -> Vec<CodexPromptContextOption> {
    value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|entry| {
            entry
                .get("skills")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|skill| {
            skill
                .get("enabled")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true)
        })
        .filter_map(|skill| {
            let name = read_json_string(skill, "name")?;
            let path = read_json_string(skill, "path")?;
            let description = skill
                .get("interface")
                .and_then(|interface| read_json_string(interface, "shortDescription"))
                .or_else(|| read_json_string(skill, "shortDescription"))
                .or_else(|| read_json_string(skill, "description"));

            Some(CodexPromptContextOption {
                description,
                kind: "skill",
                label: name.clone(),
                path: Some(path),
                value: name,
            })
        })
        .collect()
}

fn extract_prompt_context_plugins(value: &serde_json::Value) -> Vec<CodexPromptContextOption> {
    value
        .get("marketplaces")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|marketplace| {
            marketplace
                .get("plugins")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|plugin| {
            plugin
                .get("installed")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
                && plugin
                    .get("enabled")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(true)
        })
        .filter_map(|plugin| {
            let value =
                read_json_string(plugin, "id").or_else(|| read_json_string(plugin, "name"))?;
            let label = plugin
                .get("interface")
                .and_then(|interface| read_json_string(interface, "displayName"))
                .or_else(|| read_json_string(plugin, "name"))
                .unwrap_or_else(|| value.clone());
            let description = plugin
                .get("interface")
                .and_then(|interface| read_json_string(interface, "shortDescription"));

            Some(CodexPromptContextOption {
                description,
                kind: "plugin",
                label,
                path: None,
                value,
            })
        })
        .collect()
}

fn extract_prompt_context_files(
    value: &serde_json::Value,
    default_root: &str,
) -> Vec<CodexPromptContextOption> {
    value
        .get("files")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|file| {
            let relative_path = read_json_string(file, "path")?;
            let root = read_json_string(file, "root").unwrap_or_else(|| default_root.to_owned());
            let path = Path::new(&root).join(&relative_path);

            Some(CodexPromptContextOption {
                description: read_json_string(file, "file_name"),
                kind: "file",
                label: relative_path.clone(),
                path: Some(path.to_string_lossy().into_owned()),
                value: relative_path,
            })
        })
        .collect()
}

fn read_json_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_model_options_from_app_server_response() {
        let models = extract_codex_model_options(&serde_json::json!({
            "data": [
                {
                    "id": "hidden-model",
                    "model": "hidden-model",
                    "displayName": "Hidden",
                    "description": "Hidden",
                    "hidden": true,
                    "supportedReasoningEfforts": [],
                    "defaultReasoningEffort": "medium",
                    "serviceTiers": [],
                    "defaultServiceTier": null,
                    "isDefault": false
                },
                {
                    "id": "gpt-5.5",
                    "model": "gpt-5.5",
                    "displayName": "GPT-5.5",
                    "description": "Default model",
                    "hidden": false,
                    "supportedReasoningEfforts": [
                        {
                            "reasoningEffort": "low",
                            "description": "Low reasoning"
                        },
                        {
                            "reasoningEffort": "high",
                            "description": "High reasoning"
                        }
                    ],
                    "defaultReasoningEffort": "high",
                    "serviceTiers": [
                        {
                            "id": "standard",
                            "name": "Standard",
                            "description": "Default speed"
                        },
                        {
                            "id": "fast",
                            "name": "Fast",
                            "description": "Fast responses"
                        }
                    ],
                    "defaultServiceTier": "standard",
                    "isDefault": true
                }
            ],
            "nextCursor": null
        }));

        assert_eq!(models.len(), 1);
        assert_eq!(models[0].runtime, "codex");
        assert_eq!(models[0].display_name, "GPT-5.5");
        assert_eq!(models[0].default_reasoning_effort.as_deref(), Some("high"));
        assert_eq!(
            models[0].supported_reasoning_efforts[0].reasoning_effort,
            "low"
        );
        assert_eq!(models[0].service_tiers[1].name, "Fast");
        assert_eq!(models[0].default_service_tier.as_deref(), Some("standard"));
        assert!(models[0].is_default);
    }

    #[test]
    fn extracts_prompt_context_options_from_app_server_responses() {
        let skills = extract_prompt_context_skills(&serde_json::json!({
            "data": [{
                "cwd": "/tmp/Lexora",
                "skills": [{
                    "name": "lexora-buddy",
                    "description": "Buddy runtime",
                    "path": "/tmp/Lexora/.agents/skills/lexora-buddy/SKILL.md",
                    "enabled": true,
                    "interface": {
                        "shortDescription": "处理 Buddy 本地运行时"
                    }
                }],
                "errors": []
            }]
        }));
        let plugins = extract_prompt_context_plugins(&serde_json::json!({
            "marketplaces": [{
                "plugins": [{
                    "id": "browser",
                    "name": "browser",
                    "installed": true,
                    "enabled": true,
                    "interface": {
                        "displayName": "Browser",
                        "shortDescription": "Control the in-app browser"
                    }
                }]
            }]
        }));
        let files = extract_prompt_context_files(
            &serde_json::json!({
                "files": [{
                    "root": "/tmp/Lexora",
                    "path": "apps/buddy/src/chat/BuddyChatComposer.vue",
                    "file_name": "BuddyChatComposer.vue"
                }]
            }),
            "/tmp/Lexora",
        );

        assert_eq!(skills[0].kind, "skill");
        assert_eq!(skills[0].value, "lexora-buddy");
        assert_eq!(
            skills[0].description.as_deref(),
            Some("处理 Buddy 本地运行时")
        );
        assert_eq!(plugins[0].label, "Browser");
        assert_eq!(plugins[0].value, "browser");
        assert_eq!(
            files[0].path.as_deref(),
            Some("/tmp/Lexora/apps/buddy/src/chat/BuddyChatComposer.vue")
        );
    }
}
