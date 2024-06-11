import { Bool, Field, ContextFreeUpdate, ZkProcessor, ZkProcessorEnv } from 'o1js';

const AddState = {
	number: Field
};

// doesn't allow any concurrency, so multiple users cannot interact with the application at the same time
export const AddWithRaceIssue = ZkProcessor({
	name: 'Add',
	State: AddState,

	methods: {
		init: {
			privateInputs: [],
			async method(_env: ZkProcessorEnv<typeof AddState>, ..._privateInputs: never[]): Promise<ContextFreeUpdate<typeof AddState>> {
				return {
					setState: {
						number: new Field(0)
					}
				}
			}
		},

		add: {
			privateInputs: [Field],
			async method(env: ZkProcessorEnv<typeof AddState>, amount: Field): Promise<ContextFreeUpdate<typeof AddState>> {
				return {
					preconditions: {
						// TODO: consider flattening this out, only nest network params
						account: {
							state: {
								number: env.state.number
							},
							isProven: new Bool(true)
						},
					},
					setState: {
						number: env.state.number.add(amount)
					}
				}
			}
		}
	}
});
