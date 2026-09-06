import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const run = jest.fn();
const mutationOptions: Array<{mutationFn: (variables: unknown) => Promise<unknown>}> = [];
jest.mock('../src/services/api', () => ({ countriesApi: { getAll: jest.fn() } }));
jest.mock('../src/services/maintenanceApi', () => ({
 maintenanceApi: { run, getOverview: jest.fn(), getSuggestions: jest.fn() },
 maintenanceErrorMessage: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
 useQueryClient: () => ({ invalidateQueries: jest.fn() }),
 useQuery: () => ({ data: undefined, isFetching: false, isLoading: false }),
 useMutation: (options: typeof mutationOptions[number]) => {
  mutationOptions.push(options);
  return {isPending: false, mutate: jest.fn()};
 },
}));
import ProductMaintenance from '../src/pages/admin/ProductMaintenance';

test('all-country maintenance remains enabled and omits country and saved country cursor', async () => {
 const markup = renderToStaticMarkup(createElement(ProductMaintenance));
 const button = markup.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Run maintenance<\/button>/)?.[0];
 expect(button).toBeDefined();
 expect(button).not.toMatch(/ disabled(?:=|\s|>)/);
 await mutationOptions[0].mutationFn({selectedCountryId:'',previous:{hasMore:true,cursor:'1:2'}});
 expect(run).toHaveBeenCalledWith({limit:25,dry_run:false});
});
