import {configuredMaintenanceRanker} from '../maintenanceRanker';
test('requires explicit model and key',()=>{expect(configuredMaintenanceRanker({OPENAI_API_KEY:'test'})).toBeUndefined();});
test('provider cannot invent candidate ids and malformed entries are ignored',async()=>{
 const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({ranked:[{id:'999',reason:'invented'},{id:'3',reason:'same fruit'},{id:'3',reason:'duplicate'}]})}]}]})});
 const ranker=configuredMaintenanceRanker({OPENAI_API_KEY:'test',MAPPING_AI_MODEL:'configured-model'},fetcher as any)!;
 expect(await ranker({name:'Apple'} as any,[{mapping_id:'3',name:'Apfel 1 kg'}] as any)).toEqual(['3']);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('configured-model');
});
