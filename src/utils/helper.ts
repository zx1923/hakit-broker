const path = require('path');

/**
 * 被检查对象是否是指定的类型
 * 
 * @param obj 被检查对象
 * @param type 指定类型
 * @returns 
 */
function _is(obj, type: string): boolean {
  return getTypeOf(obj) === type;
}

/**
 * 拼接路径
 * 
 * @param base 基础地址
 * @param args 要拼接的地址
 * @returns 
 */
function pathJoin(base: string, ...args): string {
  return path.join(base, ...args);
}

/**
 * 拼接URL
 * 
 * @param base 基础地址
 * @param args 要拼接的URL
 * @returns 
 */
function urlJoin(base: string, ...args): string {
  return this.pathJoin(base, ...args).replace(/\\+|\/+/g, '/');
}

/**
 * 获取数据类型
 * 
 * @param obj 被检测对象
 * @returns string 
 */
function getTypeOf(obj: any): string {
  let type = Object.prototype.toString.call(obj);
  return type.replace(/\[object\s|\]/g, '');
}

/**
 * 是否为对象
 * 
 * @param obj 被检测值
 * @returns true/false
 */
function isObject(obj): boolean {
  return _is(obj, 'Object');
}

/**
 * 是否为a array
 * 
 * @param obj 被检测值
 * @returns true/false
 */
function isArray(obj): boolean {
  return _is(obj, 'Array');
}

/**
 * 是否为 function
 * 
 * @param obj 被检测值
 * @returns true/false
 */
function isFunction(obj): boolean {
  return _is(obj, 'Function') || _is(obj, 'AsyncFunction');
}

/**
 * 延时等待
 * 
 * @param ms 毫秒
 * @returns 
 */
function delay(ms: number = 0): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

/**
 * 基于模板自服务构建循环字符串
 * 
 * @param char 模板字符
 * @param times 次数
 * @returns 
 */
function strRepeat(char: string = '', times: number = 1): string {
  let res = '';
  while (times--) {
    res += char;
  }
  return res;
}

/**
 * 将命令和参数组装成命令字符串
 * 
 * @param cmd 命令
 * @param args 参数
 * @returns 
 */
function cmdStringify(cmd: string, args: Array<string> = []): string {
  if (!args.length) {
    return cmd;
  }
  args.forEach(el => {
    cmd += ' ' + el
  });
  return cmd;
}

/**
 * 获取随机字符串
 * 
 * @param len 字符串长度
 * @param strbase 字符来源
 */
function getRandomStr(len: number, strbase: string = 'qazxswedcvfrtgbnhyujmkiolp1234567890'): string {
  let restr = '';
  while (len--) {
    const idx = Math.floor(Math.random() * strbase.length);
    restr += strbase[idx];
  }
  return restr;
}

export default {
  pathJoin,
  urlJoin,
  getTypeOf,
  isObject,
  isArray,
  isFunction,
  strRepeat,
  delay,
  cmdStringify,
  getRandomStr,
};