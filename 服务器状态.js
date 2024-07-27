import os from 'os';
import systemInformation from 'systeminformation';
import dgram from 'dgram';
import DataStream from './lib/DataStream.js';
import { PingContext } from 'node-minecraft-status';
import puppeteer from '../../lib/puppeteer/puppeteer.js'
import path from 'path';

let mcPlayerList = [];

export class nekopark extends plugin {
  constructor() {
    super({
      name: "服务器状态",
      dsc: "查询服务器状态",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#服务器状态$",
          fnc: "status",
        }
      ]
    });
  }

  async getCpuLoadAndSpeed() {
    try {
      const info = await systemInformation.get({
        currentLoad: 'currentLoad',
        cpu: 'speed'
      });

      return {
        text: `${info.currentLoad.currentLoad.toFixed(2)}% (${info.cpu.speed}GHz)`,
        progress: info.currentLoad.currentLoad / 100
      };
    } catch (error) {
      return {
        text: "0% (0GHz)",
        progress: 0
      };
    }
  }

  pingHost(port, ip, callback) {
    let client = dgram.createSocket("udp4", (msg, info) => {
      client.disconnect();
      client.unref();
      let readString = buf => {
        return buf.get(buf.get()).toString()
      };
      let bbuf = DataStream.from(msg);
      callback({
        name: readString(bbuf),
        map: readString(bbuf),
        players: bbuf.getInt(),
        wave: bbuf.getInt(),
        version: bbuf.getInt(),
        vertype: readString(bbuf),
        gamemode: bbuf.get(),
        limit: bbuf.getInt(),
        description: readString(bbuf),
        modeName: readString(bbuf),
        ip: info.address,
        port: info.port
      })
    });
    client.on("connect", () => {
      client.send(Buffer.from([-2, 1]))
    });
    client.on('error', e => {
      callback(null, e)
    });
    client.connect(port, ip);
    setTimeout(() => {
      if (client.connectState == 2) {
        client.disconnect();
        client.unref();
        callback(null, new Error("Timed out"))
      }
    }, 2000)
  }

  pingHostWrapper(mdtIP) {
    return new Promise((rc, ec) => {
      this.pingHost(6567, mdtIP, (m, e) => {
        if (e) {
          ec(e);
          return
        }
        rc(m)
      })
    })
  }

  async pingServer(server) {
    const client = new PingContext();
    try {
      const response = await client.ping(server).toPromise();
      console.log(response);

      if (response && response.players && response.players.sample) {
        mcPlayerList = response.players.sample.map(player => player.name);
      } else {
        mcPlayerList = [];
      }

      return response;
    } catch (error) {
      console.error(`Ping ${server} 时出错:`, error);
      mcPlayerList = [];
      return null;
    }
  }

  async status(e) {
    try {

      const mcIPn = '127.0.0.1:45188';
      const mcResponse = await this.pingServer(mcIPn);

      const mcOnlinePlayers = mcResponse ? mcResponse.players.online : '离线';
      const mcMaxPlayers = mcResponse ? mcResponse.players.max : '离线';
      const mcVersion = mcResponse ? mcResponse.version.name : '离线';

      const totalMem = os.totalmem() / (1024 ** 3);
      const freeMem = os.freemem() / (1024 ** 3);
      const usedMem = totalMem - freeMem;
      const memUsage = ((usedMem / totalMem) * 100).toFixed(2);

      const cpuInfo = await this.getCpuLoadAndSpeed();

      const mcIP = 'sr.nekopark.cloud';
      const mdtIP = 'mdt.nekopark.cloud';

      const mdtIPn = '127.0.0.1';
      const mdtInfo = await this.pingHostWrapper(mdtIPn);

      const gameModes = ['生存', '沙盒', '进攻', 'PVP'];
      let mdtGameMode = gameModes[mdtInfo.gamemode] || '未知';

      const filteredPlayerList = mcPlayerList.filter(player => player !== "Anonymous Player");

      const data = {
        mcIP,
        mcOnlinePlayers,
        mcMaxPlayers,
        mcVersion,
        mdtIP,
        mdtMap: mdtInfo.map,
        mdtGameMode,
        mdtPlayers: mdtInfo.players,
        mdtLimit: mdtInfo.limit,
        mdtWave: mdtInfo.wave,
        mdtVersion: mdtInfo.version,
        cpuUsage: cpuInfo.text,
        totalMem: totalMem.toFixed(2),
        usedMem: usedMem.toFixed(2),
        memUsage,
        freeMem: freeMem.toFixed(2),
        mcPlayerList: filteredPlayerList.join(" ")
      };

      const currentDirectory = path.resolve();
      const htmlFilePath = path.join(currentDirectory, 'plugins', 'nekopark', 'html', 'index.html');
      const cssFilePath = path.join(currentDirectory, 'plugins', 'nekopark', 'html', 'index.css');

      console.log(data);

      const base64 = await puppeteer.screenshot('nekopark', {
        saveId: 'status',
        imgType: 'png',
        tplFile: htmlFilePath,
        pluginResources: cssFilePath,
        data: data
      });

      await e.reply(base64);
      return true;
    } catch (error) {
      const errorMessage = `获取服务器状态时出错，请稍后再试。\n错误日志: ${error.message}`;
      return this.reply(errorMessage, false, { at: true });
    }
  }
}
