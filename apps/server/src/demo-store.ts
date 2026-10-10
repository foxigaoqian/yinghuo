import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Memory, Message, Order, Post, Profile } from '@yinghuo/contracts';

type State = {
  version: 1;
  profiles: Profile[];
  memories: Memory[];
  messages: Message[];
  posts: Post[];
  orders: Order[];
  idempotency: Record<string, { fingerprint: string; resourceId: string }>;
};
const empty = (): State => ({
  version: 1,
  profiles: [],
  memories: [],
  messages: [],
  posts: [],
  orders: [],
  idempotency: {},
});
@Injectable()
export class DemoStore {
  readonly file: string;
  state: State;
  constructor() {
    const configured = process.env.DEMO_DATA_FILE;
    this.file =
      configured === ':memory:'
        ? configured
        : resolve(__dirname, '../../..', configured || '.data/demo.json');
    this.state = this.load();
    if (this.state.version !== 1 || !Array.isArray(this.state.profiles) || !this.state.idempotency)
      throw new Error('Invalid demo data format');
  }
  /**
   * 读取本地 JSON 数据。文件损坏（断电写一半、手动改错）时不让服务启动崩溃：
   * 把坏文件重命名备份为 `.corrupt-<时间戳>`，用空状态启动并打日志告警。
   */
  private load(): State {
    if (this.file === ':memory:' || !existsSync(this.file)) return empty();
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as State;
    } catch (err) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = `${this.file}.corrupt-${stamp}`;
      try {
        renameSync(this.file, backup);
      } catch {
        // 备份失败也不阻塞启动
      }
      console.warn(
        `[demo-store] 数据文件损坏，已备份为 ${backup} 并以空状态启动：${(err as Error)?.message}`,
      );
      return empty();
    }
  }
  save() {
    if (this.file === ':memory:') return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
  id() {
    return randomUUID();
  }
  now() {
    return new Date().toISOString();
  }
  profile(ownerId: string, id: string) {
    const p = this.state.profiles.find((x) => x.id === id && x.ownerId === ownerId);
    if (!p) throw new NotFoundException('空间不存在或不可访问');
    return p;
  }
  order(ownerId: string, id: string) {
    const o = this.state.orders.find((x) => x.id === id && x.ownerId === ownerId);
    if (!o) throw new NotFoundException('订单不存在或不可访问');
    return o;
  }
  replay(owner: string, operation: string, key: string, fingerprint: string) {
    const entry = this.state.idempotency[owner + ':' + operation + ':' + key];
    if (entry && entry.fingerprint !== fingerprint)
      throw new ConflictException('同一个幂等键不能提交不同内容');
    return entry?.resourceId;
  }
  remember(owner: string, operation: string, key: string, fingerprint: string, resourceId: string) {
    this.state.idempotency[owner + ':' + operation + ':' + key] = { fingerprint, resourceId };
  }
}
