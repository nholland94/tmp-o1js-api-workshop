import { Field, Proof, ZkCircuit } from 'o1js';

class AddProof extends Proof<void, Field> {}

export const AddCircuit = ZkCircuit({
	name: 'Add',
	publicOutput: Field,

	methods: {
		init: {
			privateInput: [Field],
			async method(number: Field): Promise<Field> {
				return number;
			}
		},

		add: {
			privateInput: [AddProof, Field],
			async method(prevProof: AddProof, number: Field): Promise<Field> {
				prevProof.verify();
				return prevProof.publicOutput.add(number);
			}
		}
	}
});
