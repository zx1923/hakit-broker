import axios from 'axios';

const wxRequest = axios.create();

// 暂未执行拦截操作
wxRequest.interceptors.request.use(
  config => config,
  error => Promise.reject(error)
);

wxRequest.interceptors.response.use(
  response => Promise.resolve(response.data),
  error => Promise.reject(error)
);

export default wxRequest;