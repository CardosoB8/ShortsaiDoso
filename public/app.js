const processButton = document.getElementById('process-button');
const statusMessage = document.getElementById('status-message');
const downloadLinks = document.getElementById('download-links');

processButton.addEventListener('click', async () => {
    statusMessage.textContent = 'Processando... isso pode levar alguns minutos.';
    processButton.disabled = true;
    downloadLinks.innerHTML = '';

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Erro no servidor. Verifique os logs da Vercel.');
        }

        const result = await response.json();
        
        statusMessage.textContent = 'Processamento concluído!';
        result.shorts.forEach((short, index) => {
            // Converte a string base64 de volta para um Blob (arquivo binário)
            const binaryData = atob(short.data);
            const arrayBuffer = new ArrayBuffer(binaryData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
            }
            const blob = new Blob([uint8Array], { type: 'video/mp4' });
            
            // Cria um link de download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `short-${index + 1}.mp4`;
            link.textContent = `Download do Short ${index + 1} - ${short.start} a ${short.end}`;
            link.style.display = 'block';
            link.style.marginTop = '10px';
            downloadLinks.appendChild(link);
        });

    } catch (error) {
        console.error('Erro:', error);
        statusMessage.textContent = 'Ocorreu um erro. Tente novamente.';
        processButton.disabled = false;
    }
});