import { useState, useClient, createHandler } from 'seniman';
import speech from '@google-cloud/speech';

export function Microphone(props) {
  let [isSpeechMode, set_isSpeechMode] = useState(false);
  let client = useClient();

  let clientModuleInitialized = false;

  let speechInputClient;
  let gspeech_stream;


  let startListen = () => {
    if (clientModuleInitialized) {
      client.exec(client_resumeListen);
    } else {
      client.exec(client_initListen);
    }

    set_isSpeechMode(true);
    speechInputClient = speechInputClient || new speech.SpeechClient();

    const encoding = 'LINEAR16';
    const sampleRateHertz = 16000;
    const languageCode = 'en-US';

    const request = {
      config: {
        encoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
      },
      interimResults: true, // If you want interim results, set this to true
    };

    // Create a recognize stream
    gspeech_stream = speechInputClient
      .streamingRecognize(request)
      .on('error', console.error)
      .on('data', data => {
        if (isSpeechMode() && data.results[0] && data.results[0].alternatives[0]) {

          let text = data.results[0].alternatives[0].transcript;

          if (props.onTranscription) {
            props.onTranscription(text);
          }
        }
      });
  }

  let receiveAudioChunkHandler = createHandler(chunk => {
    if (gspeech_stream) {
      gspeech_stream.write(chunk);
    }
  });

  let stopListen = () => {
    //set the stream to not writeable
    gspeech_stream.end();
    gspeech_stream = null;

    set_isSpeechMode(false);
    client.exec(client_pauseListen);
  }

  let client_pauseListen = $c(() => {
    if (scriptProcessor && audioContext.destination) {
      scriptProcessor.disconnect(audioContext.destination);
    }
    if (mediaStream) {
      mediaStream.getAudioTracks().forEach(track => track.stop());
    }
  });

  let client_resumeListen = $c(() => {
    if (scriptProcessor && audioContext.destination) {
      if (!mediaStream || mediaStream.getAudioTracks().length === 0) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then((stream) => {
            mediaStream = stream;
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination);
          });
      } else {
        scriptProcessor.connect(audioContext.destination);
      }
    }
  });

  let client_initListen = $c(() => {
    // open mediasource microphones
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      // create audio context
      .then((stream) => {
        let bufferSize = 2048;

        window.mediaStream = stream;
        window.audioContext = new AudioContext({
          latencyHint: 'interactive',
        });
        window.scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        window.microphone = audioContext.createMediaStreamSource(stream);

        microphone.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
          let leftAudioBuffer = audioProcessingEvent.inputBuffer.getChannelData(0);
          let leftAudioBuffer_16 = downsampleBuffer(leftAudioBuffer, 44100, 16000);

          $s(receiveAudioChunkHandler)(leftAudioBuffer_16);
        };

        let downsampleBuffer = function (buffer, sampleRate, outSampleRate) {
          if (outSampleRate == sampleRate) {
            return buffer;
          }
          if (outSampleRate > sampleRate) {
            throw 'downsampling rate show be smaller than original sample rate';
          }
          let sampleRateRatio = sampleRate / outSampleRate;
          let newLength = Math.round(buffer.length / sampleRateRatio);
          let result = new Int16Array(newLength);
          let offsetResult = 0;
          let offsetBuffer = 0;

          while (offsetResult < result.length) {
            let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0,
              count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
              accum += buffer[i];
              count++;
            }

            result[offsetResult] = Math.min(1, accum / count) * 0x7fff;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
          }

          return result.buffer;
        };

      });
  });

  let onClick = () => {
    if (isSpeechMode()) {
      stopListen();
    } else {
      startListen();
    }
  }

  return <div style={{ padding: '3px', border: '1px solid #999', borderRadius: '4px', cursor: 'pointer' }}>
    <svg style={{ color: isSpeechMode() ? '#00FF00' : '#ccc' }} onClick={onClick} width="14" height="13" fill="currentColor" class="bi bi-mic-fill" viewBox="0 0 16 16">
      <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z" />
      <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z" />
    </svg>
  </div>
}