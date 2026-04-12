export function validateResolutionOption(obj) {
	const required = ['rank','title','description','costDelta','timeDelta','supplierName'];
	for (const field of required) if (obj[field] === undefined || obj[field] === null) throw new Error(`ResolutionOption missing required field: ${field}`);
	if (![1,2,3].includes(obj.rank)) throw new Error('rank must be 1, 2, or 3');
	return obj;
}
