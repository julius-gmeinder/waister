<img width="233" height="93" alt="github-logo" src="https://github.com/user-attachments/assets/cc72c9c1-39f6-427a-808d-9e2877f6def9" />

---

> "To enable independent thinking, people first have to understand the matter at hand"

---

Waister is a browser extension that tracks you conversations on the big three (Claude, OpenAI, Gemini) AI-Chatbots.

**Our primary goal is to raise awareness about the environmental cost of AI**

<img width="502" height="672" alt="image" src="https://github.com/user-attachments/assets/f5806427-79b2-4c5c-b81b-b17c7d6a183b" />
<img width="1890" height="901" alt="image" src="https://github.com/user-attachments/assets/36b08e2a-caf9-4923-b3dc-2f6b9309638f" />
<img width="1895" height="897" alt="image" src="https://github.com/user-attachments/assets/b2f08c45-f1e9-45c0-9024-1c141eb19d11" />
<img width="1896" height="901" alt="image" src="https://github.com/user-attachments/assets/1b6d5df4-4f97-442c-a8c8-bce1a82488a9" />

## how it works

We estimate your token usage from:
- Prompt Input
- Output
- Thinking Time
- Overhead (system prompt, moral ruleset)
- Tools used (e. g. websearch)
- Model and Effort

Using the token estimate we infer a environmental footprint consisting of:
- Electricity used
- Water used
- Carbon output

=> With those esimates we provide everyday life examples. comparing the cost of AI with daily generic tasks.

=> Based on your model usage and data, we provide individualized tips for optimizing your prompting and usage.

## How to use

- Download the newest Release
- Build from source:
  1. `https://github.com/julius-gmeinder/waister.git wastier`
  2. `cd wastier`
  3. `npm i`
  4. `npm run build`
  5. Open Chrome > Manage Extenions > Toggle "Developer Mode" top right
  6. Load unpacked > choose `dist/build/wastier`
