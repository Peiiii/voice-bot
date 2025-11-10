import { Blob } from '@google/genai';
import { createPcmBlob } from './audioUtils';

export interface MicrophoneProcessor {
    stream: MediaStream;
    processor: ScriptProcessorNode;
    source: MediaStreamAudioSourceNode;
}

export async function setupMicrophone(
    inputAudioContext: AudioContext,
    onProcess: (blob: Blob) => void
): Promise<MicrophoneProcessor> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = inputAudioContext.createMediaStreamSource(stream);
    // Use a buffer size of 4096, with 1 input channel and 1 output channel.
    const processor = inputAudioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        onProcess(pcmBlob);
    };

    source.connect(processor);
    processor.connect(inputAudioContext.destination);

    return { stream, processor, source };
}

export function cleanupMicrophone(processor: Partial<MicrophoneProcessor>) {
    if (processor.stream) {
        processor.stream.getTracks().forEach((track) => track.stop());
    }
    if (processor.processor) {
        processor.processor.disconnect();
    }
    if (processor.source) {
        processor.source.disconnect();
    }
}
