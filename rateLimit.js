/**
 * rateLimit.js — ограничение частоты сообщений (алгоритм «ведро токенов»).
 *
 * Что делает этот файл:
 *  - класс TokenBucket: разрешает не более `rate` событий в секунду
 *    с кратковременным всплеском до `burst`;
 *  - используется для защиты от флуда сообщениями и чата.
 */

export class TokenBucket {
  /**
   * @param {number} rate скорость пополнения, токенов/сек
   * @param {number} burst максимальный запас токенов
   */
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.last = Date.now();
  }

  /**
   * Пытается потратить токены.
   * @param {number} [cost=1] стоимость события
   * @returns {boolean} true — можно, false — лимит превышен
   */
  take(cost = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}
