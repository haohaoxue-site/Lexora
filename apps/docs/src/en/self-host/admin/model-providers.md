# Model Providers

Model providers connect AI models to the instance.

## Platform Providers

Platform providers configured in admin can be used by instance users. They are suitable for centrally connecting OpenAI, Anthropic, DeepSeek, or compatible providers.

The administrator maintains provider API keys. Use separate provider-side projects, budgets, and restrictions where possible.

## Compatible Providers

SamePage AI supports OpenAI-Compatible and Anthropic-Compatible providers. Configuration includes provider name, endpoint, authentication mode, and key.

Providers can fetch models from compatible model-list endpoints. If a provider cannot return a recognizable model list, models can be maintained manually.

## Model Capabilities

Models should be configured with type and capabilities, such as chat, streaming, vision, tool calls, reasoning, or JSON mode. Feature entries filter models by capability.

## Default Models

After providers are configured, users still choose default models in personal settings. Admins provide platform capability; users or scenario defaults decide which model to use.
