import { createServer } from 'seniman/server';
import { useState, useStream, useClient } from 'seniman';
import { API_requestCompletionStream } from './api.js';
import { Tokenizer } from './token.js';

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

async function fetchMessageHistory() {
  // TODO: actually fetch message history
  return [];
}

function createCodeblockContainer() {
  let hasContentStarted = false;
  let prebuffer = '';
  let _setLanguageFn = null;

  let codeContainer = {
    childStream: useStream([]),

    pushToken: (token) => {
      if (token === '```') {
        // handle the case where the codeblock contents finishes without a newline
        if (!hasContentStarted && prebuffer) {
          codeContainer.childStream.push(prebuffer);
        }

        // TODO: start the syntax highlighting process when we exit the code block
        return { type: 'exit' };
      } else if (token == '\n') {
        if (hasContentStarted) {
          codeContainer.childStream.push(token);
        } else {
          _setLanguageFn && _setLanguageFn(prebuffer);
          hasContentStarted = true;
        }
      } else {
        if (hasContentStarted) {
          codeContainer.childStream.push(token);
        } else {
          prebuffer += token;
        }
      }
    },

    componentFn: () => {
      let [language, setLanguage] = useState('');

      // assign the setter to the outer scope to be set when we fully receive 
      // the language identifier up in the pushToken function
      _setLanguageFn = setLanguage;

      return <div style={{ margin: '5px 0' }}>
        <div style={{ borderRadius: '5px 5px 0 0', padding: '5px 15px', fontSize: '11px', background: "#888", color: "#fff" }}>
          {language() == '' ? 'Code' : language()}
        </div>
        <div class="codeblock" style={{ borderRadius: '0 0 5px 5px', padding: '10px 15px', fontSize: '13px', background: "#000", color: "#fff", overflowX: 'scroll' }}>
          <pre style={{ fontFamily: 'monospace', color: '#ddd' }}>
            <code>{codeContainer.childStream.view(token => token)}</code>
          </pre>
        </div>
      </div>;
    }
  };

  return codeContainer;
}

function createCodespanContainer() {
  let codespanContainer = {
    childStream: useStream([]),

    pushToken: (token) => {
      codespanContainer.childStream.push(token);

      if (token === '`') {
        return { type: 'exit' };
      }
    },

    componentFn: () => {
      return <code style={{ fontFamily: 'monospace', fontWeight: '600' }}>
        {codespanContainer.childStream.view(token => token)}
      </code>;
    }
  };

  codespanContainer.pushToken('`'); // show the first backtick

  return codespanContainer;
}

function createContainer(type) {
  let c = {
    type,
    childStream: useStream([]),

    pushToken: (token) => {
      if (token === '```') {
        let container = createCodeblockContainer();
        c.childStream.push(container);

        return { type: 'enter', container: container };
      } else if (token === '`') {
        let container = createCodespanContainer();
        c.childStream.push(container);

        return { type: 'enter', container: container };
      } else if (token === '\n') {

        // exit the paragraph container
        if (c.type == 'p') {
          return { type: 'exit' };
        }

      } else {
        if (c.type === 'root') {
          let container = createContainer('p');
          container.pushToken(token);
          c.childStream.push(container);

          return { type: 'enter', container };
        } else {
          c.childStream.push(token);
        }
      }
    },

    componentFn: () => {
      return <p style={{ padding: '5px 0' }}>
        {c.childStream.view((container => {
          if (typeof container == 'string') {
            return container;
          } else {
            return <container.componentFn />;
          }
        }))}
      </p>;
    }
  };

  return c;
}

let userWrapperStyle = { background: "#eee", borderRadius: '5px', maxWidth: '400px', width: 'auto', padding: '2px 15px', marginBottom: '20px', lineHeight: '1.5', fontSize: '14px', display: 'inline-block', alignSelf: 'flex-end' };
let assistantWrapperStyle = { background: "#555", color: "#fff", borderRadius: '5px', maxWidth: '400px', width: 'auto', padding: '2px 15px', marginBottom: '20px', lineHeight: '1.5', fontSize: '14px', display: 'inline-block', alignSelf: 'flex-start' };

function Message(props) {
  let { role, tokenizer } = props;
  let [isWaiting, setIsWaiting] = useState(true);

  let rootContainer = createContainer('root');
  let activeContainer = rootContainer;
  let containerParentStack = [];

  // What we do here is basically handle incoming (properly buffer-tokenized) tokens
  // and route it to "containers" that handle different types of content, such as 
  // code blocks, paragraphs, etc. with their own internal state and rendering logic.
  tokenizer.onResultTokens(tokens => {
    setIsWaiting(false);

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] == '[DONE]') {
        break;
      }

      let result = activeContainer.pushToken(tokens[i]);

      // the active container can return a non-null result to indicate that it wants to
      // exit or enter a new container (establishing new levels of nesting)
      if (result) {
        if (result.type == 'enter') {
          let newContainer = result.container;
          containerParentStack.push(activeContainer);
          activeContainer = newContainer;

        } else if (result.type == 'exit') {
          activeContainer = containerParentStack.pop();
        }
      }
    }
  });

  return <div style={role == 'user' ? userWrapperStyle : assistantWrapperStyle}>
    {isWaiting() ? "..." : <rootContainer.componentFn />}
  </div>;
}

function createTokenizerFromText(text) {
  let tokenizer = new Tokenizer();

  for (let i = 0; i < text.length; i += 2) {
    tokenizer.feedInputToken(text.slice(i, i + 2));
  }

  tokenizer.feedInputToken('[DONE]');

  return tokenizer;
}


function ConversationThread(props) {
  let [isBotTyping, set_isBotTyping] = useState(false);
  let messageStream = useStream([]);
  let conversationMessagesContext = [];
  let client = useClient();

  // TODO: actually fetch message history
  fetchMessageHistory()
    .then((history) => {
      history.forEach(msg => {
        messageStream.push({
          role: msg.role,
          // historical message is basically just a regular message being fed tokens made from the the message history
          // This makes sure there's only one code path for rendering
          tokenizer: createTokenizerFromText(msg.text)
        });

        conversationMessagesContext.push({
          role: msg.role,
          tokens: msg.tokens.join('')
        })
      });
    });

  let onSubmit = async (userText) => {
    set_isBotTyping(true);

    conversationMessagesContext.push({
      role: 'user',
      content: userText
    })

    let assistantMessageContext = {
      role: 'assistant',
      content: ''
    };

    let tokenizer = new Tokenizer();

    API_requestCompletionStream(API_KEY, conversationMessagesContext, (rawToken) => {
      tokenizer.feedInputToken(rawToken);

      if (rawToken != '[DONE]') {
        assistantMessageContext.content += rawToken;
      } else {
        onFinished();
      }
    });

    conversationMessagesContext.push(assistantMessageContext);

    // add the user message to the stream
    messageStream.push({
      role: 'user',
      tokenizer: createTokenizerFromText(userText)
    });

    // add the bot message to the stream
    messageStream.push({
      role: 'assistant',
      tokenizer: tokenizer
    });
  }

  let onFinished = () => {
    set_isBotTyping(false);

    // TODO: do this in a post-render hook of the setState above (so we don't need the setTimeout)
    client.exec($c(() => {
      setTimeout(() => {
        document.getElementById("textbox").focus();
      }, 10);
    }));
  }

  return <>
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: -1 }}>
      <div style={{ fontSize: "30px", color: '#aaa' }}>
        SenimanGPT
      </div>
    </div>
    <div style={{ width: '600px', margin: '0 auto', position: 'relative', height: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingTop: '20px', paddingBottom: '80px', position: 'relative' }}>
        {messageStream.view(message => <Message role={message.role} tokenizer={message.tokenizer} />)}
      </div>
      <div style={{ backdropFilter: 'blur(5px)', position: 'fixed', bottom: '15px', zIndex: 100, padding: "5px", width: 'inherit', background: '#666', borderRadius: '5px' }}>
        <textarea id="textbox" disabled={isBotTyping()} placeholder={isBotTyping() ? "Bot is writing..." : "Write a message to the bot.."} onKeyDown={$c(e => {
          // get value from textarea with whitespace trimmed
          let value = e.target.value.trim();

          // submit on enter (make sure Shift isn't pressed)
          if (e.key === 'Enter' && !e.shiftKey && value) {
            $s(onSubmit)(value);
            e.target.value = '';
            e.preventDefault();
          }
        })}
          style={{ border: 'none', width: '100%', color: '#fff', padding: '5px', boxSizing: 'border-box', background: 'transparent', fontFamily: 'inherit', resize: 'none' }}
        ></textarea>
      </div>
    </div >
  </>;
}

function Body() {
  return <div>
    <ConversationThread />
  </div>
}

function Head() {
  return <>
    <meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1.0,user-scalable=no' />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reset.css@2.0.2/reset.min.css" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" />
    <style>
      {`
        body {
          background:#777;
          font-family: Inter;
        }

        input::-webkit-input-placeholder {
          color: #fff;
        }

        textarea:focus {
          outline: none;
        }
      `}
    </style>
  </>
}

let server = createServer({ Body, Head });
server.listen(3020);

console.log("Server listening on port 3020");