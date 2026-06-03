# Quick Start

This page is for users who already have access to a SamePage AI instance. To deploy your own instance, start with [Docker Compose](/en/self-host/docker-compose).

## 1. Sign In

Open the instance URL and sign in with one of the enabled login methods. On self-hosted instances, available login methods are configured by the administrator.

## 2. Configure Models

Open `Settings -> Providers` and add or enable an AI provider. Providers can come from presets or from OpenAI-Compatible / Anthropic-Compatible endpoints.

Then open `Settings -> Default Models` and choose default models for chat and document AI. AI entries may not run until a usable default model is configured.

## 3. Start an AI Chat

Open `Chat` from the left navigation. You can create a session, choose a model, and send a prompt. Chat supports streaming generation, stopping, retrying, and switching between message branches.

## 4. Create a Document

Open `Documents` and create a page. Document pages are rich text documents designed for notes, specs, guides, and collaborative writing.

## 5. Invite Collaborators

Use the document collaboration entry to invite a user by user code or create a collaboration link. Permissions can be read-only or editable, and scope can cover only the current page or its descendants.

## 6. Publish a Public Page

Use publication settings when a document needs to be visible to outside visitors. SamePage AI supports single-page publishing and site publishing. Public pages are read-only and do not enter collaborative editing.
