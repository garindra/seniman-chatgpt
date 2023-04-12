import { useState, createCollection } from 'seniman';

function createCodeblockContainer() {
  let hasContentStarted = false;
  let prebuffer = '';
  let _setLanguageFn = null;

  let codeContainer = {
    childCollection: createCollection([]),

    pushToken: (token) => {
      if (token === '```') {
        // handle the case where the codeblock contents finishes without a newline
        if (!hasContentStarted && prebuffer) {
          codeContainer.childCollection.push(prebuffer);
        }

        // TODO: start the syntax highlighting process when we exit the code block
        return { type: 'exit' };
      } else if (token == '\n') {
        if (hasContentStarted) {
          codeContainer.childCollection.push(token);
        } else {
          _setLanguageFn && _setLanguageFn(prebuffer);
          hasContentStarted = true;
        }
      } else {
        if (hasContentStarted) {
          codeContainer.childCollection.push(token);
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

      return <div style={{ margin: '10px 0' }}>
        <div style={{ borderRadius: '5px 5px 0 0', padding: '5px 15px', fontSize: '11px', background: "#888", color: "#fff" }}>
          {language() == '' ? 'Code' : language()}
        </div>
        <div class="codeblock" style={{ borderRadius: '0 0 5px 5px', padding: '10px 15px', fontSize: '12px', background: "#000", color: "#fff", overflowX: 'scroll' }}>
          <pre style={{ fontFamily: 'monospace', color: '#ddd' }}>
            <code>{codeContainer.childCollection.view(token => token)}</code>
          </pre>
        </div>
      </div>;
    }
  };

  return codeContainer;
}

function createCodespanContainer() {
  let codespanContainer = {
    childCollection: createCollection([]),

    pushToken: (token) => {
      codespanContainer.childCollection.push(token);

      if (token === '`') {
        return { type: 'exit' };
      }
    },

    componentFn: () => {
      return <code style={{ fontFamily: 'monospace', fontWeight: '600' }}>
        {codespanContainer.childCollection.view(token => token)}
      </code>;
    }
  };

  codespanContainer.pushToken('`'); // show the first backtick

  return codespanContainer;
}

export function createContainer(type) {
  let c = {
    type,
    childCollection: createCollection([]),

    pushToken: (token) => {
      if (token === '```') {
        let container = createCodeblockContainer();
        c.childCollection.push(container);

        return { type: 'enter', container: container };
      } else if (token === '`') {
        let container = createCodespanContainer();
        c.childCollection.push(container);

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
          c.childCollection.push(container);

          return { type: 'enter', container };
        } else {
          c.childCollection.push(token);
        }
      }
    },

    componentFn: () => {
      return <p style={{ padding: '10px 0' }}>
        {c.childCollection.view((container => {
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