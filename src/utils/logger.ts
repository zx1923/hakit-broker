const chalk = require('chalk');
const datetime = require('silly-datetime');

const gray = chalk.gray;

/**
 * 获取当前时分字符串
 * @returns 当前的时分字符串，附带毫秒
 */
 function strNow(format = 'HH:mm:ss') {
  const now = Date.now();
  let mil = '000' + (now % 1000);
  return datetime.format(now, format) + `.${mil.substring(mil.length - 3)}`;
}

/**
 * 打印字符串消息
 * 
 * @param type 类型
 * @param  msgs 消息
 */
function printByType(type: string, ...msgs): void {
  const msglog = msgs.map(el => {
    return chalk[type](el);
  });
  console.log(gray(`[${strNow()}]`), `${chalk[type](this.tag)}:`, ...msglog);
}

/**
 * 处理控制台打印
 */
class Logger {
  tag: string

  constructor (tag: string) {
    this.tag = tag;
  }

  ln(): void {
    console.log();
  }
  
  info(...msgs): void {
    printByType.call(this, 'cyan', ...msgs);
  }
  
  error(...msgs): void {
    printByType.call(this, 'red', ...msgs);
  }
  
  warn(...msgs): void {
    printByType.call(this, 'yellow', ...msgs);
  }
  
  label(...msgs): void {
    return this.warn(...msgs);
  }
  
  success(...msgs): void {
    printByType.call(this, 'green', ...msgs);
  }
}

class LoggerAdapter {
  constructor(tag: string, stdout: boolean = true) {
    if (stdout) {
      const instance = new Logger(tag);
      return instance;
    }
    
    const instance: Object = {};
    ['ln', 'info', 'error', 'warn', 'label', 'success'].forEach(fn => {
      instance[fn] = () => {};
    });
    return instance;
  }
}

export {
  Logger,
  LoggerAdapter,
};