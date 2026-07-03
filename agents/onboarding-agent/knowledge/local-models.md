# Local Models and Autodiscovery

Murici was designed with a strict commitment to privacy and independence from cloud providers. Therefore, the autodiscovery of LLMs running on your own machine is seamless and automatic.

## How does autodiscovery work?
Whenever you initialize the application, Murici silently checks standard ports on your machine ("localhost") looking for popular engines, such as:
- **Ollama**: Searched on port `11434`.
- **LM Studio**: Searched on port `1234`.
- Other engines compatible with the OpenAI API format.

If a model is detected, it will immediately become available in your chat selectors, requiring absolutely no manual configuration!

## The Importance of the "Automated Tasks Model"
For Murici to truly shine, it is vital that you define your model for background tasks.
In the top header, the configuration button will allow you to select this default model. It will be responsible for:
1. Generating titles for your conversations automatically.
2. Enriching your Knowledge Graph (via the Enrich feature).
3. Processing heavy requests without freezing the main interface.

Do not forget to point out which local (or cloud) model will handle these silent automations!
