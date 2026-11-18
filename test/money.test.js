import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateLine} from '../src/money.js';
test('GST is applied after discount and rounded to paise',()=>assert.deepEqual(calculateLine(199.99,3,50,5),{taxable:549.97,tax:27.5,total:577.47}));
test('zero tax and quantity multiplication',()=>assert.deepEqual(calculateLine(100,2,0,0),{taxable:200,tax:0,total:200}));
test('excessive discounts rejected',()=>assert.throws(()=>calculateLine(100,1,101,5)));
