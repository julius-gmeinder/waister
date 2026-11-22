<img width="233" height="93" alt="github-logo" src="https://github.com/user-attachments/assets/cc72c9c1-39f6-427a-808d-9e2877f6def9" />

---

> "To enable independent thinking, people first have to understand the matter at hand"

---

Waister is a browser extension that tracks you conversations on the big three (Claude, OpenAI, Gemini) AI-Chatbots.

**Our primary goal is to raise awareness about the environmental cost of AI**

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
