const host = "https://api.weixin.qq.com";

export default {
  // 获取token
  getToken: {
    method: 'get',
    url: `${host}/cgi-bin/token`
  },
  invokeFunction: {
    method: 'post',
    url: `${host}/tcb/invokecloudfunction?access_token={access_token}&env={env}&name={name}`
  },
  // 查询记录
  dbQuery: {
    method: 'post',
    url: `${host}/tcb/databasequery?access_token={access_token}`
  },
  // 更新记录
  dbUpdate: {
    method: 'post',
    url: `${host}/tcb/databaseupdate?access_token={access_token}`
  }
};