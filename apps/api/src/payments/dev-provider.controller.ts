import { Body, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { SIMULATOR_MODES, SimulatedPaymentProvider } from './simulated-payment-provider.js';

const setModeBody = z.strictObject({ mode: z.enum(SIMULATOR_MODES) });

/**
 * DEVELOPMENT ONLY. Registered only when DEV_TOOLS=true and NODE_ENV is not "production".
 * Changes how the simulator answers future charges; it never touches payments, accounts, or the ledger.
 */
@Controller('dev/provider')
export class DevProviderController {
  constructor(private readonly simulator: SimulatedPaymentProvider) {}

  @Get()
  inspect(): ReturnType<SimulatedPaymentProvider['inspect']> {
    return this.simulator.inspect();
  }

  @Post('mode')
  setMode(@Body(new ZodPipe(setModeBody)) body: z.infer<typeof setModeBody>): ReturnType<SimulatedPaymentProvider['inspect']> {
    this.simulator.configure({ mode: body.mode });
    return this.simulator.inspect();
  }
}
