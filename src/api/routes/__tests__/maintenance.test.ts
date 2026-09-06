import express from 'express';
import request from 'supertest';
jest.mock('../../../repositories/ProductMaintenanceRepository',()=>({ProductMaintenanceRepository:jest.fn()}));
import { createMaintenanceRouter } from '../maintenance';
function app(admin=false){const a=express();a.use(express.json());a.use((req,_res,next)=>{req.isAuthenticated=(()=>admin) as any;if(admin)req.user={id:'1',role:'admin'} as any;next();});const service={overview:jest.fn().mockResolvedValue({coverage:[],runs:[]}),run:jest.fn().mockResolvedValue({id:'1'})};a.use('/maintenance',createMaintenanceRouter(service as any));return {a,service};}
test('maintenance overview requires authentication',async()=>{expect((await request(app().a).get('/maintenance/overview')).status).toBe(401);});
test('admin can read coverage and run status',async()=>{expect((await request(app(true).a).get('/maintenance/overview')).body).toEqual({coverage:[],runs:[]});});
test('bounded run rejects excessive work before starting service',async()=>{const {a,service}=app(true);expect((await request(a).post('/maintenance/run').send({limit:26})).status).toBe(400);expect(service.run).not.toHaveBeenCalled();});
