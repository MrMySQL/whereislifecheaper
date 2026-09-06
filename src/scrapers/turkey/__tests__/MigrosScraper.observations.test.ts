jest.mock('../../../config/env', () => ({config:{scraper:{headless:true,maxRetries:1,timeout:1000}}}));
import { MigrosScraper, migrosConfig } from '../MigrosScraper';
import { ScraperConfig } from '../../../types/scraper.types';
import { Page } from 'playwright';

jest.mock('../../../utils/logger', () => {
  const stub = {info:jest.fn(),warn:jest.fn(),error:jest.fn(),debug:jest.fn()};
  return {scraperLogger:stub,logger:stub,createPrefixedLogger:()=>stub};
});
class FixtureScraper extends MigrosScraper {
  constructor(items: unknown[]) {
    super({...migrosConfig,supermarketId:'1'} as ScraperConfig);
    this.page = {request:{get:async()=>({ok:()=>true,json:async()=>({successful:true,data:{searchInfo:{pageCount:1,hitCount:items.length,storeProductInfos:items}}})})}} as unknown as Page;
  }
  observe() { return this.scrapeCategory({id:'fruit',name:'Fruit',url:'/fruit'}); }
}
const item=(status:string)=>({sku:status,name:'Elma Golden Kg',prettyName:`elma-${status}`,status,shownPrice:10495,regularPrice:10495,discountRate:0,unit:'GRAM',unitAmount:1000});

test('persists explicit out-of-stock observations while ignoring unknown API statuses',async()=>{
  const scraper=new FixtureScraper([item('IN_SALE'),item('OUT_OF_STOCK'),item('UNRECOGNIZED')]);
  const observations=await scraper.observe();
  expect(observations.map(p=>({id:p.externalId,available:p.isAvailable}))).toEqual([
    {id:'IN_SALE',available:true},{id:'OUT_OF_STOCK',available:false},
  ]);
});
