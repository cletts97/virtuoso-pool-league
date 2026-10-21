import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/live',workers:1,fullyParallel:false,timeout:60000,retries:0,reporter:'list',use:{baseURL:'http://127.0.0.1:5174',channel:'chrome',viewport:{width:1440,height:1000},trace:'retain-on-failure'}});
