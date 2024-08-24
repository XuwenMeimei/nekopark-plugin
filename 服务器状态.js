import dgram from 'dgram';
import DataStream from './lib/DataStream.js';
import { PingContext } from 'node-minecraft-status';
import puppeteer from '../../lib/puppeteer/puppeteer.js'
import path from 'path';
import axios from 'axios';
import fs from 'fs';

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

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async status(e) {
    try {
      const mcIPn = '192.168.100.129:45188';
      const mcResponse = await this.pingServer(mcIPn);

      const mcOnlinePlayers = mcResponse ? mcResponse.players.online : '离线';
      const mcMaxPlayers = mcResponse ? mcResponse.players.max : '离线';
      const mcVersion = mcResponse ? mcResponse.version.name : '离线';

      const mcIP = 'sr.nekopark.cloud';
      const mdtIP = 'mdt.nekopark.cloud';

      const mdtIPn = '192.168.100.129';
      const mdtInfo = await this.pingHostWrapper(mdtIPn);

      const gameModes = ['生存', '沙盒', '进攻', 'PVP'];
      let mdtGameMode = gameModes[mdtInfo.gamemode] || '未知';

      const filteredPlayerList = mcPlayerList.filter(player => player !== "Anonymous Player");

      const currentDirectory = path.resolve();
      const tokenFilePath = path.join(currentDirectory, 'plugins', 'nekopark', 'token.json');

      const tokenData = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));
      const token = tokenData.token;

      const serverId = 2;
      const url = `http://status.xyc.icu/api/v1/server/details?id=${serverId}`;
      const headers = {
        'Authorization': token
      };

      const serverResponse = await axios.get(url, { headers });
      const serverData = serverResponse.data;

      const server = serverData.result[0];

      const usedMem = server.status.MemUsed;
      const totalMem = server.host.MemTotal;

      const freeMem = totalMem - usedMem;
      const MemUsage = (usedMem / totalMem) * 100;

      const apiResponse = await axios.get('http://w.xyc.icu:45200/api/serverStatus');
      const mapsnap = apiResponse.data.mapSnap;
      const mapid = apiResponse.data.mapId;
      const ram = apiResponse.data.Ram;
      const tps = apiResponse.data.tps;
      const unit = apiResponse.data.allUnit;

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
        cpuUsage: server.status.CPU.toFixed(2),
        memUsage: MemUsage.toFixed(2),
        freeMem: this.formatBytes(freeMem),
        usedMem: this.formatBytes(usedMem),
        totalMem: this.formatBytes(totalMem),
        inSpeed: this.formatBytes(server.status.NetInSpeed),
        outSpeed: this.formatBytes(server.status.NetOutSpeed),
        inAll: this.formatBytes(server.status.NetInTransfer),
        outAll: this.formatBytes(server.status.NetOutTransfer),
        mcPlayerList: filteredPlayerList.join(" "),
        mapsnap,
        ram,
        mapid,
        tps,
        unit,
      };

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
