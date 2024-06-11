import { Field, ProvableInstance, ZkEnum, ZkContract, ZkContractEnv, ZkContractRequestEnv, ZkContractRequest } from 'o1js';

const AddState = {
	number: Field
};

const AddAction = ZkEnum({
	Add: { amount: Field }
});

const AddContract = ZkContract({
	name: 'Add',
	State: AddState,
	Actions: AddAction,

	init: {
		privateInputs: [],
		async init(env: ZkContractEnv<typeof AddState>) {
			env.state.number.set(new Field(0));
		}
		// async init(env: ZkProcessorEnv<typeof AddState>): Promise<ZkContractInitialization<typeof AddState>> {
		// 	return {
		// 		state: {
		// 			number: new Field(0)
		// 		}
		// 	};
		// }
	},

	requests: {
		Add: {
			privateInputs: [Field],
			async request(_env: ZkContractRequestEnv, number: Field): Promise<ZkContractRequest<typeof AddAction>> {
				return new ZkContractRequest({
					pushActions: [new AddAction.Add(number)]
				});
			}
		}
	},

	actionHandlers: {
		Add: {
			privateInputs: [],
			async handle(env: ZkContractEnv<typeof AddAction>, action: ProvableInstance<typeof AddAction['Add']>) {
				const number = env.state.number.get();
				env.state.number.set(number.add(action.body.number));
			}
		}
	}
});
