import { clearTranslationCache, mappingVocabulary, translateText } from '../MappingVocabulary';
import type { MaintenanceTarget } from '../../types/maintenance.types';
afterEach(()=>{jest.restoreAllMocks();clearTranslationCache();delete process.env.GOOGLE_TRANSLATE_API_KEY;});
test('English country vocabulary works without a provider key',async()=>{
 expect(await mappingVocabulary({name:'Whole milk 1 L',country_code:'AU'} as MaintenanceTarget)).toEqual(['Whole milk 1 L']);
});
test('translation sends bounded plain text and caches repeated names',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{translations:[{translatedText:'Zucchero 1 kg'}]}})});
 expect(await translateText('Sugar 1 kg','it','en',fetcher)).toBe('Zucchero 1 kg');
 expect(await translateText('Sugar 1 kg','it','en',fetcher)).toBe('Zucchero 1 kg');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({q:'Sugar 1 kg',source:'en',target:'it',format:'text'});
});
test('provider errors do not expose its raw response',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';const fetcher=jest.fn().mockResolvedValue({ok:false,text:async()=>'secret'});
 await expect(translateText('Brown sugar','it','en',fetcher)).rejects.toThrow('Translation unavailable');
});
test('optional semantic vocabulary supplies local synonyms without requiring translation key',async()=>{
 process.env.OPENAI_API_KEY='test';process.env.MAPPING_AI_MODEL='configured-model';
 jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({aliases:['zucchero','zucchero semolato']})}]}]})} as Response);
 try {expect(await mappingVocabulary({name:'White sugar 1 kg',country_name:'Italy',country_code:'IT'} as MaintenanceTarget)).toEqual(['zucchero','zucchero semolato']);}
 finally {delete process.env.OPENAI_API_KEY;delete process.env.MAPPING_AI_MODEL;}
});
test('batch translations preserve input order and duplicate names',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';const fetcher=jest.fn().mockResolvedValue({ok:true,json:async()=>({data:{translations:[{translatedText:'Apples'},{translatedText:'Pears'}]}})});
 const {translateTexts}=await import('../MappingVocabulary');
 expect(await translateTexts(['Mele verdi','Pere verdi','Mele verdi'],'en','it',fetcher)).toEqual(['Apples','Pears','Apples']);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).q).toEqual(['Mele verdi','Pere verdi']);
});

test('multi-language vocabulary retains successes when another language fails',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';
 jest.spyOn(global,'fetch').mockImplementation(async(_url,options)=>{
  const body=JSON.parse(options!.body as string);
  if(body.target==='uz')throw new Error('Provider unavailable');
  return {ok:true,json:async()=>({data:{translations:[{translatedText:'Сахар'}]}})} as Response;
 });
 expect(await mappingVocabulary({name:'Sugar 1 kg',country_code:'UZ'} as MaintenanceTarget)).toEqual(['Сахар']);
});

test('all failed languages report a translation failure',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';
 jest.spyOn(global,'fetch').mockRejectedValue(new Error('provider secret'));
 await expect(mappingVocabulary({name:'Sugar 1 kg',country_code:'UZ'} as MaintenanceTarget)).rejects.toThrow('Translation unavailable');
});

test('failed vocabulary retains the original diagnostic cause without exposing it in the message',async()=>{
 process.env.GOOGLE_TRANSLATE_API_KEY='test';
 const cause=new Error('provider secret');
 jest.spyOn(global,'fetch').mockRejectedValue(cause);
 const error=await mappingVocabulary({name:'Sugar 1 kg',country_code:'UZ'} as MaintenanceTarget).catch(e=>e);
 expect(error.message).toBe('Translation unavailable');
 expect(error.cause).toBe(cause);
 expect(Object.getOwnPropertyDescriptor(error, 'cause')).toMatchObject({writable:true,enumerable:false,configurable:true});
 expect(JSON.stringify(error)).not.toContain('provider secret');
});
