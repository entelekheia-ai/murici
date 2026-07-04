# Local Models and Autodiscovery

Murici was designed with a strict commitment to privacy and independence from cloud infrastructure. Therefore, the autodiscovery of LLMs running on your own machine is seamless and automatic.

## How does autodiscovery work?
You don't need to spend time configuring complex paths, API keys, or writing lines of code just to run a private model. Every time you open Murici, it silently scans standard ports on your machine looking for active local servers:
- **Ollama**: Searched on port `11434`.
- **LM Studio**: Searched on port `1234`.
- **oMLX**: Configuration file or port `8000`.
- Other engines compatible with the OpenAI API format.

If a model is detected, it will immediately become available in your chat selectors, requiring absolutely no manual configuration!