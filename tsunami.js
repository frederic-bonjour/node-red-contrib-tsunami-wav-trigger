const SerialPort = require('serialport');

module.exports = function(RED) {

  const SOM1 = 0xf0;
  const SOM2 = 0xaa;
  const EOM  = 0x55;

  const tLog = (data) => console.log("Tsunami:", data);

  function TsunamiWavTrigger(config) {
    RED.nodes.createNode(this, config);

    let reconnectTimer;
    let reconnectAllowed = true;

    const CONTROL_TRACK = (controlCode, track, output) => {
      trackLSB = track & 0x00ff;
      trackMSB = (track & 0xff00) >> 8;
      buff = Buffer.alloc(10);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 10;   // data length
      buff[3] = 3;    // command: CONTROL_TRACK
      buff[4] = controlCode;
      buff[5] = trackLSB;
      buff[6] = trackMSB;
      buff[7] = output - 1;
      buff[8] = 0;
      buff[9] = EOM;
      port.write(buff);
    };

    const STOP_ALL = () => {
      buff = Buffer.alloc(5);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 5;    // data length
      buff[3] = 4;    // command: STOP_ALL
      buff[4] = EOM;
      port.write(buff);
    };

    const TRACK_FADE = (track, volume, duration) => {
      buff = Buffer.alloc(12);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 12;      // data length
      buff[3] = 0x0a;    // command : TRACK_FADE
      buff[4] = track & 0x00ff;
      buff[5] = (track & 0xff00) >> 8;
      buff[6] = volume & 0x00ff;
      buff[7] = (volume & 0xff00) >> 8;
      buff[8] = duration & 0x00ff;
      buff[9] = (duration & 0xff00) >> 8;
      buff[10] = 0; // do NOT stop track when fade is complete
      buff[11] = EOM;
      port.write(buff);
console.log('track fade', track, volume, duration);
    };

    const TRACK_VOLUME = (track, volume) => {
      buff = Buffer.alloc(9);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 9;    // data length
      buff[3] = 8;    // command : TRACK_VOLUME
      buff[4] = track & 0x00ff;
      buff[5] = (track & 0xff00) >> 8;
      buff[6] = volume & 0x00ff;
      buff[7] = (volume & 0xff00) >> 8;
      buff[8] = EOM;
      port.write(buff);
    };

    const OUTPUT_VOLUME = (output, volume) => {
      buff = Buffer.alloc(9);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 8;    // data length
      buff[3] = 5;    // command : TRACK_VOLUME
      buff[4] = output;
      buff[5] = volume & 0x00ff;
      buff[6] = (volume & 0xff00) >> 8;
      buff[7] = EOM;
      port.write(buff);
      console.log(`Set volume of output ${output} to ${volume}.`)
    };

    const GET_SYS_INFO = () => {
      buff = Buffer.alloc(5);
      buff[0] = SOM1;
      buff[1] = SOM2;
      buff[2] = 5;   // data length
      buff[3] = 2;   // command : GET_SYS_INFO
      buff[4] = EOM;
      port.write(buff);
    };

    const reconnect = () => {
      tLog("reconnecting...");
      if (!port.isOpen) {
        try {
          port.open();
        } catch (e) {}
      }
    };

    tLog("opening port " + config.serialPort + "...");
    const port = new SerialPort(config.serialPort, {
      baudRate: 57600
    });

    port.on('open', () => {
      this.status({ fill: 'green', shape: 'dot', text: 'connected' });
      this.send({ topic: 'status', payload: 'connected' })
      if (reconnectTimer) clearInterval(reconnectTimer);
      tLog("connected.");
    });

    port.on('close', () => {
      tLog("closed");
      this.status({ fill: 'grey', shape: 'dot', text: 'disconnected' });
      this.send({ topic: 'status', payload: 'disconnected' })
      if (reconnectAllowed) {
        reconnectTimer = setInterval(() => reconnect(), config.reconnectInterval || 1000);
      }
    });

    port.on('error', (err) => {
      tLog(err);
      this.status({ fill: 'red', shape: 'dot', text: 'error' });
      this.send({ topic: 'status', payload: 'error' })
    });


    this.on('input', async (msg, send, done) => {
      const { track, output } = msg.payload;
      switch (msg.topic) {
        case 'play':
          CONTROL_TRACK(0, track, output);
          break;

        case 'play_mix':
          CONTROL_TRACK(1, track, output);
          break;

        case 'pause':
          CONTROL_TRACK(2, track, output);
          break;

        case 'resume':
          CONTROL_TRACK(3, track, output);
          break;

        case 'stop':
          CONTROL_TRACK(4, track, output);
          break;

        case 'stop_all':
          STOP_ALL();
          break;

        case 'loop_on':
          CONTROL_TRACK(5, track, output);
          break;

        case 'loop_off':
          CONTROL_TRACK(6, track, output);
          break;

        case 'volume':
          TRACK_VOLUME(track, msg.payload.volume);
          break;

        case 'fade':
          TRACK_FADE(track, msg.payload.volume, msg.duration || 2000);
          break;

        case 'output_volume':
          OUTPUT_VOLUME(output, msg.payload.volume);
          break;

        case 'get_sys_info':
          GET_SYS_INFO();
          break;
      }
      done();
    });

    this.on('close', function(done) {
      if (port.isOpen) {
        reconnectAllowed = false;
        port.close();
        tLog("closed.");
      }
      done();
    });
  }

  RED.nodes.registerType("tsunami wav trigger", TsunamiWavTrigger);
}; 
