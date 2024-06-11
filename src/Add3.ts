import { Bool, Field, Poseidon, ProvableInstance, ContextFreeUpdate, Struct, Proof, ZkEnum, ZkCircuit, ZkProcessor, ZkProcessorEnv } from 'o1js';

const AddState = {
	number: Field,
	actionsCheckpoint: Field,
	actionsSnapshot: Field
};

const AddAction = ZkEnum({
	Add: { amount: Field }
});

class AddReductionStatement extends Struct({
	actionsSnapshot: Field,
	number: Field
}) {
	// TODO: auto generate this
	assertEquals(other: AddReductionStatement) {
		this.actionsSnapshot.assertEquals(other.actionsSnapshot);
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
			privateInputs: [AddReducerProof, Field, AddAction.Add],
			async method(input: AddReductionStatement, prevProof: AddReducerProof, actionsSnapshotTail: Field, action: ProvableInstance<typeof AddAction.Add>): Promise<AddReductionStatement> {
				prevProof.verify();
				input.assertEquals(prevProof.publicInput);

				const prevStatement = prevProof.publicOutput;
				prevStatement.actionsSnapshot.assertEquals(Poseidon.hash([actionsSnapshotTail, Poseidon.hash(AddAction.Add.toFields(action))]));
				const newNumber = prevStatement.number.add(action.body.amount);

				return new AddReductionStatement({
					actionsSnapshot: actionsSnapshotTail,
					number: newNumber
				});
			}
		}
	}
});

export class MerkleListRange extends Struct({
	start: Field
	// end: Field
}) {
	// TODO: there should be a helper for this, surely
	assertEquals(other: MerkleListRange) {
		this.start.assertEquals(other.start);
		// this.end.assertEquals(other.end);
	}
}

export class ReversedMerkleListState extends Struct({
	inOrderList: Field,
	revOrderList: Field
}) {
}

export class ReversedMerkleListProof extends Proof<MerkleListRange, ReversedMerkleListState> {}

export const ReversedMerkleList = ZkCircuit({
	name: "ReversedActions",
	publicInput: MerkleListRange,
	publicOutput: ReversedMerkleListState,

	methods: {
		empty: {
			privateInputs: [],

			async method(range: MerkleListRange) {
				range.start.assertNotEquals(new Field(0));
				// range.start.assertNotEquals(range.end);

				return new ReversedMerkleListState({
					inOrderList: range.start,
					revOrderList: new Field(0),
				});
			}
		},

		cons: {
			privateInputs: [Field, Field, ReversedMerkleListProof],

			async method(range: MerkleListRange, head: Field, tail: Field, prevProof: ReversedMerkleListProof) {
				prevProof.verify();
				prevProof.publicInput.assertEquals(range);
				const state = prevProof.publicOutput;
				// state.inOrderList.assertNotEquals(range.end);

				state.inOrderList.assertEquals(Poseidon.hash([tail, head]));

				return new ReversedMerkleListState({
					inOrderList: tail,
					revOrderList: Poseidon.hash([state.revOrderList, head]),
				});
			}
		}
	}
});

export const AddWithSideEffectSafeSequencing = ZkProcessor({
	name: 'Add',
	State: AddState,

	methods: {
		init: {
			privateInputs: [],
			async method(_env: ZkProcessorEnv<typeof AddState>, ..._privateInputs: never[]): Promise<ContextFreeUpdate<typeof AddState>> {
				return {
					setState: {
						number: new Field(0),
						actionsCheckpoint: new Field(0),
						actionsSnapshot: new Field(0)
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

		// TODO: MerkleListSubSliceProof
		takeActionsSnapshot: {
			privateInputs: [ReversedMerkleListProof],
			async method(_env: ZkProcessorEnv<typeof AddState>, reversedActionsProof: ReversedMerkleListProof): Promise<ContextFreeUpdate<typeof AddState>> {
				reversedActionsProof.verify();
				const actionsRange = reversedActionsProof.publicInput;
				const reversalState = reversedActionsProof.publicOutput;

				// actionsRange.end.assertEquals(reversalState.inOrderList);

				return {
					preconditions: {
						account: {
							actionState: actionsRange.start,
							state: {
								actionsCheckpoint: reversalState.inOrderList,
								actionsSnapshot: new Field(0)
							},
							isProven: new Bool(true)
						}
					},
					setState: {
						actionsCheckpoint: actionsRange.start,
						actionsSnapshot: reversalState.revOrderList
					}
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
							state: {
								number: reductionInput.number,
								actionsSnapshot: reductionInput.actionsSnapshot
							},
							isProven: new Bool(true)
						}
					},
					setState: {
						number: reductionOutput.number,
						actionsSnapshot: reductionInput.actionsSnapshot
					}
				}
			}
		}
	}
});
