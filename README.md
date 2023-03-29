# seniman-chatgpt
A fast, light ChatGPT UI built with [Seniman](https://github.com/senimanjs/seniman). Loads with only 3KB of JS upfront, and uses WebSockets to stream the interface on-the-fly.

https://user-images.githubusercontent.com/510503/228690712-753bd67b-e8c7-4b3d-8b22-f97bf83a855e.mov


## Set up the app
1. Clone this repository
2. Install the dependencies
```bash
npm install
```
3. Run the build script
```bash
npm run build
```
4. Start the server (passing your OpenAI API key as an environment variable)
```bash
OPENAI_API_KEY=<...> npm start
```
Get your OpenAI API key [here](https://platform.openai.com/account/api-keys).

5. Open the app at `http://localhost:3020`

## Network Performance
Compared to OpenAI's native `chat.openai.com`'s frontend:

#### OpenAI
- Downloads 600KB of JS upfront 
- ~160KB of data per message (short code block + 5 sentence paragraph)

#### Seniman
- Downloads 3KB of JS upfront & 3KB of websocket messages to set up UI
- ~5KB of WS data per message of same size
