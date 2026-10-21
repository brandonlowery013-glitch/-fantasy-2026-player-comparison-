export function propEventLimit(value,fallback){
 const text=String(value??'').trim(),limit=Number(text===''?fallback:text);
 if(!Number.isSafeInteger(limit)||limit<0)throw Error('MARKET_MAX_PROP_EVENTS must be a nonnegative integer');
 return limit;
}
