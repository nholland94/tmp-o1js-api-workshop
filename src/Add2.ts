import { Bool, Field, Poseidon, ProvableInstance, ContextFreeUpdate, Struct, Proof, ZkEnum, ZkCircuit, ZkProcessor, ZkProcessorEnv } from 'o1js';

const AddState = {
	number: Field,
	actionsCheckpoint: Field
};

const AddAction = ZkEnum({
	Add: { amount: Field }
});

class AddReductionStatement extends Struct({
	actionState: Field,
	number: Field
}) {
	// TODO: auto generate this
	assertEquals(other: AddReductionStatement) {
		this.actionState.assertEquals(other.actionState);
		this.number.assertEquals(other.number);
	}
}

class AddReducerProof extends Proof<AddReductionStatement, AddReductionStatement> {}

const AddReducer = ZkCircuit({
	name: 'AddReducer',
	publicInput: AddReductionStatement,
	publicOutput: AddReductionStatement,

	methods: {
		init: {
			privateInputs: [AddReductionStatement],
			async method(input: AddReductionStatement, init: AddReductionStatement): Promise<AddReductionStatement> {
				input.assertEquals(init);
				return input;
			}
		},

		handleAction: {
			privateInputs: [AddReducerProof, AddAction.Add],
			async method(input: AddReductionStatement, prevProof: AddReducerProof, action: ProvableInstance<typeof AddAction['Add']>): Promise<AddReductionStatement> {
				prevProof.verify();
				input.assertEquals(prevProof.publicInput);

				const prevStatement = prevProof.publicOutput;
				const newActionState = Poseidon.hash([prevStatement.actionState, Poseidon.hash(AddAction.Add.toFields(action))]);
				const newNumber = prevStatement.number.add(action.body.amount);

				return new AddReductionStatement({
					actionState: newActionState,
					number: newNumber
				});
			}
		}
	}
});

// allows concurrency via sequencing user interactions into the action state, but breaks if the reducer is not running quickly enough
export const AddWithNaiveSequencing = ZkProcessor({
	name: 'Add',
	State: AddState,

	methods: {
		init: {
			privateInputs: [],
			async method(_env: ZkProcessorEnv<typeof AddState>, ..._privateInputs: never[]): Promise<ContextFreeUpdate<typeof AddState>> {
				return {
					setState: {
						number: new Field(0),
						actionsCheckpoint: new Field(0)
					}
				}
			}
		},

		requestAdd: {
			privateInputs: [Field],
			async method(_env: ZkProcessorEnv<typeof AddState>, amount: Field): Promise<ContextFreeUpdate<typeof AddState>> {
				return {
					pushActions: [
						[amount]
					]
				}
			}
		},

		reduceActions: {
			privateInputs: [AddReducerProof],

			async method(_env: ZkProcessorEnv<typeof AddState>, reduction: AddReducerProof): Promise<ContextFreeUpdate<typeof AddState>> {
				reduction.verify();
				const reductionInput = reduction.publicInput;
				const reductionOutput = reduction.publicOutput;

				return {
					preconditions: {
						account: {
							actionState: reductionOutput.actionState,
							state: {
								number: reductionInput.number,
								actionsCheckpoint: reductionInput.actionState
							},
							isProven: new Bool(true)
						}
					},
					setState: {
						number: reductionOutput.number,
						actionsCheckpoint: reductionOutput.actionState
					}
				}
			}
		}
	}
});
