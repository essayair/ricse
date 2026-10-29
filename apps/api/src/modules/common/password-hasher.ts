import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import * as bcrypt from 'bcryptjs';

/**
 * bcrypt 运算放到工作线程执行。bcryptjs 是纯 JS 实现，在主线程比对会占满事件循环：
 * 登录并发或恶意撞库时，所有接口都会被拖慢。工作线程无法创建时退回主线程异步计算。
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const bcrypt = require(workerData.bcryptPath);
parentPort.on('message', ({ id, op, args }) => {
  try {
    const result = op === 'hash' ? bcrypt.hashSync(args[0], args[1]) : bcrypt.compareSync(args[0], args[1]);
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
`;

type Operation = 'hash' | 'compare';
interface Task {
  id: number;
  op: Operation;
  args: [string, string | number];
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

class BcryptWorkerPool {
  private readonly idle: Worker[] = [];
  private readonly queue: Task[] = [];
  private readonly running = new Map<Worker, Task>();
  private size = 0;
  private seq = 0;
  private disabled = false;

  constructor(private readonly maxWorkers: number) {}

  run<T>(op: Operation, args: [string, string | number]): Promise<T> {
    if (this.disabled) return this.runInline(op, args) as Promise<T>;
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id: ++this.seq, op, args, resolve: resolve as (value: unknown) => void, reject });
      this.drain();
    });
  }

  private runInline(op: Operation, args: [string, string | number]) {
    return op === 'hash' ? bcrypt.hash(args[0], args[1] as number) : bcrypt.compare(args[0], args[1] as string);
  }

  private drain() {
    while (this.queue.length) {
      let worker = this.idle.pop();
      if (!worker && this.size < this.maxWorkers) worker = this.spawn();
      if (!worker) return;
      const task = this.queue.shift()!;
      this.running.set(worker, task);
      // 有任务时保持引用，空闲时取消引用，避免空闲线程阻止进程或测试退出。
      worker.ref();
      worker.postMessage({ id: task.id, op: task.op, args: task.args });
    }
  }

  private spawn(): Worker | undefined {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { bcryptPath: require.resolve('bcryptjs') } });
    } catch {
      this.disabled = true;
      for (const task of this.queue.splice(0)) this.runInline(task.op, task.args).then(task.resolve, task.reject);
      return undefined;
    }
    this.size++;
    worker.unref();
    worker.on('message', (message: { result?: unknown; error?: string }) => {
      const task = this.running.get(worker);
      this.running.delete(worker);
      worker.unref();
      this.idle.push(worker);
      if (task) {
        if (message.error) task.reject(new Error(message.error));
        else task.resolve(message.result);
      }
      this.drain();
    });
    const retire = (error: Error) => {
      const task = this.running.get(worker);
      const idleIndex = this.idle.indexOf(worker);
      if (!task && idleIndex < 0) return;
      this.running.delete(worker);
      if (idleIndex >= 0) this.idle.splice(idleIndex, 1);
      this.size--;
      task?.reject(error);
      this.drain();
    };
    worker.on('error', retire);
    worker.on('exit', (code) => retire(new Error(`密码计算线程异常退出（${code}）`)));
    return worker;
  }
}

const pool = new BcryptWorkerPool(Math.max(1, Math.min(2, cpus().length - 1)));

export function hashPassword(plain: string, rounds = 10): Promise<string> {
  return pool.run<string>('hash', [plain, rounds]);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return pool.run<boolean>('compare', [plain, hash]);
}

/** 账号不存在时用于等耗时比对的固定哈希，成本因子与真实密码一致（10）。 */
export const TIMING_EQUALIZER_HASH = '$2a$10$U88p0etIdmq0.a9lKpjyx.runMn6zgBqD0HBG8VEr39Yi1ejPbLiC';
