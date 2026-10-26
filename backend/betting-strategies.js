// All progression decisions use total round net, not individual split outcomes.
export function createBettingPlan(config) {
  const { betting, baseBet, tableLimit } = config;
  let bet = baseBet, index = 1, cycle = 0;
  const fibonacci = [1, 1];
  // Keep the first number reaching the cap. Never accumulate unbounded debt
  // or grow Fibonacci numbers beyond safe integer precision at the table limit.
  while (fibonacci.at(-1) * baseBet < tableLimit) fibonacci.push(fibonacci.at(-1) + fibonacci.at(-2));
  const cap = value => Math.min(tableLimit, Math.max(baseBet, value));
  return {
    current: () => bet,
    settle(net) {
      if (betting === 'martingale') bet = net < 0 ? cap(bet * 2) : net > 0 ? baseBet : bet;
      if (betting === 'dalembert') bet = cap(bet + (net < 0 ? baseBet : net > 0 ? -baseBet : 0));
      if (betting === 'paroli' && net !== 0) {
        cycle = net < 0 ? 0 : (cycle + 1) % 3;
        bet = cap(baseBet * 2 ** cycle);
      }
      if (betting === 'fibonacci' && net !== 0) {
        index = net < 0 ? Math.min(index + 1, fibonacci.length - 1) : index - 2;
        if (index < 0) index = 1;
        bet = cap(baseBet * fibonacci[index]);
      }
      if (betting === 'wave' || betting === 'pulse') {
        const pattern = betting === 'wave' ? [1, 2, 3, 2] : [1, 1, 1, 1, 5];
        cycle = (cycle + 1) % pattern.length;
        bet = cap(baseBet * pattern[cycle]);
      }
      return bet;
    },
  };
}
