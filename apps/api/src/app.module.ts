import { Module, type DynamicModule } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller.js';
import { AccountsService } from './accounts/accounts.service.js';
import { ActingUserResolver } from './common/acting-user.js';
import type { AppConfig } from './config.js';
import { LedgerService } from './ledger/ledger.service.js';
import { DevProviderController } from './payments/dev-provider.controller.js';
import { PAYMENT_PROVIDER } from './payments/payment-provider.js';
import { PaymentsController } from './payments/payments.controller.js';
import { PAYMENTS_CONFIG, PaymentsService, type PaymentsConfig } from './payments/payments.service.js';
import { SimulatedPaymentProvider } from './payments/simulated-payment-provider.js';
import { InMemoryStore } from './store/in-memory-store.js';
import { TransfersController } from './transfers/transfers.controller.js';
import { TransfersService } from './transfers/transfers.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Module({})
export class AppModule {
  static forRoot(config: Pick<AppConfig, 'devTools' | 'providerTimeoutMs'>): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        UsersController,
        AccountsController,
        TransfersController,
        PaymentsController,
        ...(config.devTools ? [DevProviderController] : []),
      ],
      providers: [
        InMemoryStore,
        LedgerService,
        ActingUserResolver,
        UsersService,
        AccountsService,
        TransfersService,
        PaymentsService,
        { provide: PAYMENTS_CONFIG, useValue: { providerTimeoutMs: config.providerTimeoutMs } satisfies PaymentsConfig },
        SimulatedPaymentProvider,
        // Swap a real provider in here: { provide: PAYMENT_PROVIDER, useClass: RealProviderAdapter }.
        { provide: PAYMENT_PROVIDER, useExisting: SimulatedPaymentProvider },
      ],
    };
  }
}
