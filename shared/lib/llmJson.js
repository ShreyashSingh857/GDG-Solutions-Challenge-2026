export function extractJSON(rawResponse) {
	const cleaned = String(rawResponse ?? '')
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();

	if (!cleaned) return '';

	try {
		JSON.parse(cleaned);
		return cleaned;
	} catch {
		// Continue with best-effort extraction.
	}

	const start = cleaned.search(/[\[{]/);
	if (start === -1) return cleaned;

	for (let end = cleaned.length - 1; end > start; end--) {
		const char = cleaned[end];
		if (char !== '}' && char !== ']') continue;
		const candidate = cleaned.slice(start, end + 1).trim();
		try {
			JSON.parse(candidate);
			return candidate;
		} catch {
			// Keep shrinking until we find valid JSON.
		}
	}

	return cleaned.slice(start).trim();
}

export function buildParseRetryPrompt(prompt, err) {
	return `${prompt}\n\nYour previous response failed to parse as JSON. Error: ${err.message}\nPlease respond with ONLY valid JSON and nothing else.`;
}

export async function generateWithRetry(
	prompt,
	systemPrompt = '',
	{
		maxRetries = 2,
		invokeModel,
		extractText = (result) => (typeof result === 'string' ? result : String(result?.text ?? '')),
		initialRawResponse,
		initialModelResult = null,
	} = {}
) {
	if (!Number.isInteger(maxRetries) || maxRetries < 1) {
		throw new Error('maxRetries must be an integer >= 1');
	}

	let attempts = 0;
	let workingPrompt = prompt;
	let lastError = null;
	let lastRaw = '';
	let modelResult = initialModelResult;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		attempts = attempt;
		try {
			if (attempt === 1 && initialRawResponse !== undefined) {
				lastRaw = String(initialRawResponse ?? '');
			} else {
				if (typeof invokeModel !== 'function') {
					throw new Error('invokeModel is required when no initialRawResponse is provided');
				}
				modelResult = await invokeModel(workingPrompt, { attempt, maxRetries, systemPrompt });
				lastRaw = extractText(modelResult);
			}

			const parsed = JSON.parse(extractJSON(lastRaw));
			return {
				parsed,
				raw: lastRaw,
				attempts,
				modelResult,
			};
		} catch (err) {
			lastError = err;
			lastError.rawModelResponse = lastRaw;
			if (attempt < maxRetries) {
				workingPrompt = buildParseRetryPrompt(workingPrompt, err);
				continue;
			}
		}
	}

	throw lastError || new Error('Model response parsing failed');
}

