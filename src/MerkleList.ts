import { Bool, Field, Struct, Poseidon, PrivateKey, Proof, ProvableInstance, ContextFreeUpdate, ZkEnum, ZkCircuit, ZkProcessor, ZkProcessorEnv, ZkContract, ZkContractEnv, ZkContractRequestEnv, ZkContractRequest } from 'o1js';

export class MerkleList extends Struct({
	commit: Field
}) {
	static empty(): MerkleList {
		return new MerkleList({commit: new Field(0)});
	}

	// TODO: auto generate
	assertEquals(other: MerkleList) {
		this.commit.assertEquals(other.commit);
	}
}

export class MerkleListNode extends Struct({
	tail: MerkleList,
	head: Field
}) {
	// TODO: auto generate
	assertEquals(other: MerkleListNode) {
		this.tail.assertEquals(other.tail);
		this.head.assertEquals(other.head);
	}

	toList(): MerkleList {
		return new MerkleList({ commit: Poseidon.hash(MerkleListNode.toFields(this))});
	}

	identifier(): Field {
		return this.toList().commit;
	}
}

// LAYER 1 (fka: ZkProgram)
export class ZkListProof extends Proof<void, MerkleList> {}

export const ZkList = ZkCircuit({
	publicOutput: MerkleList,

	methods: {
		push: {
			privateInputs: [ZkListProof, Field],
			async method(listProof: ZkListProof, element: Field) {
				listProof.verify();
				const list = listProof.publicOutput;
				return new MerkleListNode({tail: list, head: element}).toList();
			}
		},

		pop: {
			privateInputs: [ZkListProof, Field, MerkleList],
			async method(listProof: ZkListProof, head: Field, tail: MerkleList) {
				listProof.verify();
				const list = listProof.publicOutput;
				new MerkleListNode({tail, head}).toList().assertEquals(list);
				return tail;
			}
		}
	}
});

// LAYER 2
export const MerkleListState = {
	list: MerkleList
};

export const MinaList = ZkProcessor({
	State: MerkleListState,

	methods: {
		init: {
			privateInputs: [],
			async method(_env: ZkProcessorEnv<typeof MerkleListState>): Promise<ContextFreeUpdate<typeof MerkleListState>> {
				return {
					setState: {
						list: MerkleList.empty()
					}
				};
			}
		},

		push: {
			privateInputs: [Field],
			async method(env: ZkProcessorEnv<typeof MerkleListState>, element: Field): Promise<ContextFreeUpdate<typeof MerkleListState>> {
				const newList = new MerkleListNode({tail: env.state.list, head: element}).toList();

				// new AccountUpdate
				return {
					preconditions: {
						account: {
							state: {
								list: env.state.list
							},
							isProven: new Bool(true)
						}
					},
					setState: {
						list: newList
					}
				};
			}
		},

		pop: {
			privateInputs: [Field, MerkleList],
			async method(env: ZkProcessorEnv<typeof MerkleListState>, head: Field, tail: MerkleList): Promise<ContextFreeUpdate<typeof MerkleListState>> {
				new MerkleListNode({tail, head}).assertEquals(env.state.list);

				return {
					preconditions: {
						account: {
							state: {
								list: env.state.list
							},
							isProven: new Bool(true)
						}
					},
					setState: {
						list: tail
					}
				};
			}
		}
	}
});

// LAYER 3
export const ListAction = ZkEnum({
	Push: {element: Field},
	Pop: {}
});

export class ListStorage extends MerkleStorage(MerkleListNode) {}

export const ListApp = ZkContract({
	State: MerkleListState,
	Action: ListAction,

	components: {
		listStorage: ListStorage,
	},

	init: {
		privateInputs: [],
		async init(env: ZkProcessorEnv<typeof MerkleListState>) {
			env.state.list.set(MerkleList.empty());
		}
	},

	// in requests, we can apply rules for when actions can be pushed
	// note that actions don't need to be 1-1 with requests (multiple requests could build actions in different ways)
	requests: {
		Push: {
			privateInputs: [PrivateKey, Field],
			async request(_env: ZkContractRequestEnv, privateKey: PrivateKey, element: Field): Promise<ZkContractRequest<typeof ListAction>>  {
				// example of what this would actually do is elided
				hasPermissionToPush(privateKey).assertTrue();

				return new ZkContractRequest({
					pushActions: [new ListAction.Push({element})]
				});
			}
		},

		Pop: {
			privateInputs: [PrivateKey],
			async request(_env: ZkContractRequestEnv, privateKey: PrivateKey): Promise<ZkContractRequest<typeof ListAction>> {
				// example of what this would actually do is elided
				hasPermissionToPop(privateKey).assertTrue();

				return {
					pushActions: [new ListAction.Pop()]
				};
			}
		}
	},

	actionHandlers: {
		Push: {
			privateInputs: [],
			// NOTE: ZkActionHandlerEnv and ZkActionHandlerStatement can probably just be ZkProcessorEnv and ZkProcessorStatment
			async handle(env: ZkContractEnv<typeof MerkleListState>, action: ProvableInstance<typeof ListAction['Push']>) {
				const list = env.state.list.get();
				const newListNode = new MerkleListNode({tail: list, head: action.body.element});
				await env.components.listStorage.write(newListNode);
				env.state.list.set(newListNode.toList());
			}
		},

		Pop: {
			privateInputs: [],
			async handle(env: ZkContractEnv<typeof MerkleListState>, _action: ProvableInstance<typeof ListAction['Pop']>) {
				const list = env.state.list.get();
				const listNode = await env.components.listStorage.read(list);
				env.state.list.set(listNode.tail);
			}
		}
	}

	// ALSO: can specify additional methods here outside of this regular lifecycle, which are just regular ZkProcessor methods
	// extraMethods: {
	//   ...
	// }
});

// now we can instantiated the list app with different components
const myListAppPrivateKey = PrivateKey.random();
const MyListApp = new ListApp({
	publicKey: myListAppPrivateKey.toPublicKey(),
	components: {
		listStorage: OffChainStorage
		// set to InMemoryStorage for tests, or SqliteStorage for local (unshared) persistence
	}
});

// interact with the list app
const userPrivateKey = PrivateKey.random();
MyListApp.deploy();
MyListApp.requests.Push(userPrivateKey, new Field(1));
MyListApp.requests.Push(userPrivateKey, new Field(2));
MyListApp.requests.Push(userPrivateKey, new Field(3));
MyListApp.requests.Pop(userPrivateKey);

MyListApp.reduceActions({
	// here we parameterize the private inputs for each action reducer (in this case we have none)
	Push: (_action) => [],
	Pop: (_action) => []
});
