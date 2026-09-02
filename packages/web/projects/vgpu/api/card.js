import request from '@/utils/request';

const apiPrefix = '/api/vgpu';


class cardApi {
  getCardList(data = { filters: {} }) {
    return {
      url: apiPrefix +  '/v1/gpus',
      method: 'POST',
      data,
    };
  }

  getCardType(data = { filters: {} }) {
    return {
      url: apiPrefix +  '/v1/gpu-types',
      method: 'POST',
      data,
    };
  }

  getCardListReq(data) {
    return request(this.getCardList(data));
  }

  getCardDetail(params) {
    return request({
      url: apiPrefix +  '/v1/gpu',
      method: 'get',
      params,
    });
  }

  getRangeVector(data) {
    return request({
      url: apiPrefix +  '/v1/monitor/query/range-vector',
      method: 'post',
      data,
    });
  }

  // `config` holds extra axios request options (e.g. `{ silent: true }` from
  // `withBackgroundSilence` for background polling).
  getInstantVector(data, config = {}) {
    return request({
      ...config,
      url: apiPrefix +  '/v1/monitor/query/instant-vector',
      method: 'post',
      data,
    });
  }
}

export default new cardApi();
