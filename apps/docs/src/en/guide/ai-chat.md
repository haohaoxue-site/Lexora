# AI Chat

AI chat is one of the main SamePage AI surfaces. It is used for everyday questions, writing assistance, content organization, and document-aware conversations.

## Sessions and Models

Each chat session belongs to the current personal workspace. You can use a default model or select another enabled model in the session.

Model configuration comes from `Settings -> Providers` and `Settings -> Default Models`. Administrators can also enable platform-level providers for the whole instance.

## Streaming Generation

Assistant replies stream into the UI. You can stop generation and retry failed replies. Run state, message content, and events are stored on the server so the session can be resumed after refresh.

## Message Branches

SamePage AI uses a message-tree model for chat. When you regenerate a reply or continue from an existing message, the UI displays branch navigation so you can switch between alternatives.

Switching branches updates the active path of the session without deleting other branches.

## Document-Aware Chat

Inside a document page, the right-side chat panel can use current document references and selected text as context for the next AI run.

Document context is attached to the triggering run. It is not copied into the ordinary chat message body.
