/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import log4js from 'log4js';
import {MemoryLogger} from '../memoryLogger';

describe('memoryLogger', () => {
  let time = 0;
  let logger: MemoryLogger = ((null: any): MemoryLogger);
  const underlyingLogger = log4js.getLogger('test');
  underlyingLogger.setLevel('OFF');

  beforeEach(() => {
    time = 0;
    const time0 = new Date(0).getTimezoneOffset() * 60 * 1000; // midnight
    jasmine.unspy(Date, 'now');
    spyOn(Date, 'now').andCallFake(() => time0 + time);
    logger = new MemoryLogger(underlyingLogger, 5 * 60 * 1000);
  });

  it('logs and formats correctly', () => {
    time = 1000;
    logger.info('msg1');
    time = 2000;
    logger.warn('%s%d', 'msg', 2);
    expect(logger.dump()).toBe('00:00:01 INFO - msg1\n00:00:02 WARN - msg2\n');
  });

  it('expunges old messages', () => {
    time = 1 * 60 * 1000;
    logger.info('1min');
    time = 2 * 60 * 1000;
    logger.info('2min');
    time = 3 * 60 * 1000;
    logger.info('3min');
    time = 4 * 60 * 1000;
    logger.info('4min');
    time = 5 * 60 * 1000;
    logger.info('5min');
    expect(logger.dump()).toBe(
      '00:01:00 INFO - 1min\n00:02:00 INFO - 2min\n00:03:00 INFO - 3min\n00:04:00 INFO - 4min\n00:05:00 INFO - 5min\n',
    );
    time = 6 * 60 * 1000 + 1;
    logger.info('6min');
    expect(logger.dump()).toBe(
      '00:02:00 INFO - 2min\n00:03:00 INFO - 3min\n00:04:00 INFO - 4min\n00:05:00 INFO - 5min\n00:06:00 INFO - 6min\n',
    );
  });

  it('declines to store anything given zero retention period', () => {
    logger = new MemoryLogger(underlyingLogger, 0);
    time = 1000;
    logger.info('msg1');
    expect(logger.dump()).toBe('');
  });

  it('limits storage size', () => {
    time = 0;
    logger = new MemoryLogger(null, 1000, '00:00:00 INFO - '.length + 10);
    logger.info('123456789');
    logger.info('11');
    expect(logger.dump()).toBe('00:00:00 INFO - 11\n');
  });
});
