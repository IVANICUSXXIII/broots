// Manual de Broots en portugués de Brasil (ver es.js, que es el original). Mismos temas y mismos id en los tres idiomas.

export const MANUAL = [
  {
    id: 'que-es',
    titulo: 'O que é o Broots',
    bloques: [
      { texto: 'O Broots é o seu bibliotecário de bolso: ajuda você a organizar, encontrar e ler seus e-books. Ele usa a mesma pasta do Calibre, então não precisa importar nem copiar nada: é chegar e ler.' },
      { texto: 'O Calibre e o Broots convivem numa boa. O que você muda em um aparece no outro, porque os dois usam o mesmo arquivo da biblioteca (metadata.db).' },
      {
        lista: [
          'O Broots nunca mexe nesse arquivo por conta própria: cada mudança é feita com as ferramentas oficiais do Calibre.',
          'Antes de cada mudança, ele salva um backup do banco de dados na pasta .broots/respaldos, dentro da sua biblioteca.',
          'Se o Calibre não estiver instalado neste PC, o Broots baixa a própria cópia dessas ferramentas (você vê isso em Configurações → Calibre).',
        ],
      },
      { texto: 'O Broots é gratuito e é software livre, com a mesma licença do Calibre (GPL versão 3): você pode usá-lo, compartilhá-lo e modificá-lo. Veja em Configurações → Sobre.' },
    ],
  },
  {
    id: 'primeros-pasos',
    titulo: 'Primeiros passos',
    bloques: [
      {
        pasos: [
          'Na primeira vez, o Broots procura a biblioteca do Calibre deste PC. Se não encontrar, clique em “Escolher pasta” e escolha a pasta que tem o arquivo metadata.db.',
          'À esquerda ficam suas bibliotecas (as do Calibre e as da Família) e os filtros: autores, etiquetas, séries e mais.',
          'Em cima fica a busca: digite parte do título, do autor ou de uma etiqueta.',
          'Clique em um livro para abrir o painel dele, com a capa, os dados e o que você pode fazer: ler, editar, enviar para o Kindle ou compartilhar.',
        ],
      },
      { subtitulo: 'Buscas de especialista (como no Calibre)' },
      {
        lista: [
          'tags:romance → livros com uma etiqueta que contém “romance”.',
          'author:"=Jorge Luis Borges" → exatamente esse autor.',
          'rating:>3 → mais de três estrelas.',
          'Você pode combinar com and, or e not: tags:romance not tags:lido.',
        ],
      },
      { texto: 'Para usar outra pasta de biblioteca, passar para o tema escuro (ou voltar para a luz) ou escolher o idioma do Broots (espanhol, inglês ou português), entre em Configurações → Geral.' },
    ],
  },
  {
    id: 'agregar',
    titulo: 'Adicionar e converter livros',
    bloques: [
      {
        lista: [
          'Clique no “+” da barra de cima ou arraste os arquivos (EPUB, PDF, MOBI…) para a janela do Broots. Pode mandar a pilha toda.',
          'Se um livro não tiver EPUB ou PDF, o painel dele mostra “Converter para EPUB” ou “Converter para PDF”. Pode demorar um pouco: bom momento para um cafezinho.',
          'Os livros protegidos (DRM) são copiados do jeito que estão: o Broots não remove a proteção nem os converte.',
        ],
      },
    ],
  },
  {
    id: 'editar',
    titulo: 'Editar os dados de um livro',
    bloques: [
      { texto: 'No painel do livro, clique em “Editar”. Lá estão todos os dados: título, autores, série, etiquetas, datas, editora, as colunas que você criou no Calibre, a capa e os formatos.' },
      {
        lista: [
          '“Buscar dados” traz dados e capas do Google Books e da Open Library. Se quiser que ele também busque na Amazon (que costuma ter capas melhores), ative isso em Configurações → Privacidade.',
          'Você também pode colar o endereço da página do livro em qualquer site, e o Broots copia os dados para o formulário.',
          'Para trocar a capa, arraste uma imagem sobre ela. Simples assim.',
          'Confira o que ele trouxe e clique em “Salvar”. Só os campos que você mudou são salvos: o resto fica como estava.',
        ],
      },
    ],
  },
  {
    id: 'kindle',
    titulo: 'Kindle: envio e destaques',
    bloques: [
      { subtitulo: 'Enviar livros para o Kindle' },
      {
        pasos: [
          'Em Configurações → Kindle e e-mail, digite seu Gmail, uma senha de app (veja Perguntas frequentes) e o endereço @kindle.com do seu Kindle.',
          'Na Amazon, entre em Gerenciar seu conteúdo e dispositivos → Preferências → Configurações de documentos pessoais e adicione seu Gmail à lista de e-mails aprovados.',
          'Pronto: o painel de cada livro passa a mostrar “Enviar para o Kindle”.',
        ],
      },
      { texto: 'A Amazon aceita EPUB e PDF de até 50 MB. Os formatos MOBI e AZW não são mais aceitos por e-mail: converta o livro para EPUB antes.' },
      { subtitulo: 'Importar seus destaques' },
      {
        lista: [
          'Conecte o Kindle pelo cabo USB (desbloqueado), clique no botão Kindle da barra e depois em “Importar do Kindle”.',
          'Você também pode arrastar o arquivo My Clippings.txt do Kindle para a janela.',
          'O Broots separa os destaques por livro e os salva na pasta da sua biblioteca. Se não reconhecer um livro, ele pergunta qual é (e nunca mais esquece).',
          'Se um livro estiver no Kindle mas não na sua biblioteca, você pode adicioná-lo pela mesma tela.',
          'Eles convivem com os que você faz no leitor do Broots: uma lista só por livro e um .md só (veja Destaques e notas).',
        ],
      },
    ],
  },
  {
    id: 'lector',
    titulo: 'Ler e traduzir',
    bloques: [
      { texto: 'No painel de um livro EPUB, clique em “Ler” para abri-lo no leitor do Broots. A poltrona fica por sua conta.' },
      {
        lista: [
          'Passe as páginas com as setas ← →, com a roda do mouse ou com um clique nas laterais (sem precisar molhar o dedo).',
          'Em cima ficam o sumário, o tamanho da letra e o número da página: digite um número e aperte Enter para ir até lá.',
          'Para traduzir para o idioma do Broots, cadastre sua chave do Gemini em Configurações → Leitura e tradução (veja Perguntas frequentes) e clique no botão de traduzir do leitor.',
          'Clique em um parágrafo traduzido para ver o original, caso queira comparar.',
          'Selecione um trecho com o mouse para destacá-lo e anotar algo (veja Destaques e notas).',
          'Esc volta para a biblioteca.',
        ],
      },
    ],
  },
  {
    id: 'subrayados',
    titulo: 'Destaques e notas',
    bloques: [
      { texto: 'No leitor do Broots você pode destacar como no papel, sem borrar o livro nem brigar com a caneta marca-texto.' },
      {
        pasos: [
          'Selecione um trecho com o mouse. Aparece uma barrinha com quatro cores logo acima.',
          'Clique numa cor e o trecho fica destacado. Em “Nota” você anota o que veio à cabeça; “Copiar” copia para colar onde quiser.',
          'Para mudar a cor, editar a nota ou apagar, clique no destaque. Se apagar sem querer, o aviso lá em cima tem “Desfazer”.',
        ],
      },
      {
        lista: [
          'O botão do marca-texto, em cima no leitor, abre a lista dos destaques daquele livro, por capítulo. Clique em um e vá direto para a página dele.',
          'Os destaques ficam presos ao texto, não à página: aparecem iguais com outra letra, outro tamanho de janela ou quando você abre o livro de novo.',
          'Com a tradução também: o que você destaca num idioma fica marcado exatamente naquele idioma; no outro, o parágrafo ganha uma linha colorida embaixo (a frase exata não existe no outro idioma).',
          'Os destaques do Kindle daquele livro aparecem em cinza no texto, quando o Broots encontra a frase no EPUB. Se o EPUB for de outra edição e ele não encontrar, eles continuam na lista.',
          'No painel de cada livro está a lista completa, com a origem de cada um (Broots ou Kindle) e filtros para ver só uns ou outros. O clube de leitura também leva todos.',
          'As notas: Ctrl+Enter, Esc ou um clique fora salvam; “Cancelar” descarta o que você escreveu.',
        ],
      },
      { subtitulo: 'O .md de cada livro (para Obsidian ou Notion)' },
      {
        lista: [
          'O Broots monta sozinho um arquivo .md por livro com o título, o autor e seus destaques e notas, em ordem de capítulo. Ele se atualiza cada vez que você destaca, anota ou importa do Kindle.',
          'Ele fica na pasta “data” do livro, dentro da sua biblioteca. É a pasta que o Calibre reserva para os arquivos extras de cada livro: aparece em “Arquivos de dados” e vai junto se você mudar o título ou o autor.',
          'No final do arquivo há uma linha que diz “Daqui para baixo é seu”: o que você escrever abaixo dela, o Broots nunca mexe. O de cima ele remonta sozinho, então escreva suas notas no Broots ou abaixo dessa linha.',
          'No painel do livro (e na lista do leitor) você tem “Mostrar o .md”, que abre a pasta dele, e “Salvar uma cópia…”, que pergunta onde salvar (no seu cofre do Obsidian, por exemplo).',
          'Se não quiser o .md na pasta de cada livro, desligue em Configurações → Leitura e tradução. Seus destaques continuam salvos.',
        ],
      },
      { texto: 'Os destaques ficam na pasta .broots da sua biblioteca, junto com os do Kindle. Se você usa o Broots em dois PCs com a biblioteca no Google Drive, cada PC escreve o seu próprio arquivo: um nunca sobrescreve o outro, e o que você apaga num é apagado no outro também.' },
    ],
  },
  {
    id: 'habito',
    titulo: 'Hábito de leitura',
    bloques: [
      { texto: 'Cada vez que você lê no leitor, o Broots anota a sessão sozinho: quanto tempo você leu de verdade e quantas páginas. O relógio para se passarem 5 minutos sem virar a página ou se você minimizar a janela, então pausa para o cafezinho não conta como leitura.' },
      { subtitulo: 'Sessão de leitura' },
      {
        lista: [
          'O botão da ampulheta, no alto do leitor, tem três modos: Livre (sem relógio à vista), Minutos (uma meta de 15 a 60) e Até o fim do capítulo.',
          'Os avisos nunca interrompem no meio de um parágrafo: só aparecem quando você passa a página.',
          'Descanso para os olhos (regra 20-20-20): a cada 20 minutos, um aviso suave convida você a olhar algo longe por uns 20 segundos. Ele some sozinho e dá para desligar no mesmo botão ou em Configurações → Leitura e tradução.',
          'Embaixo, ao lado da porcentagem, o Broots mostra quanto falta para terminar o capítulo e o livro, de acordo com o seu ritmo real.',
        ],
      },
      { subtitulo: 'Modo foco' },
      { texto: 'Aperte F (ou o botão dos quatro cantos) e fica só o texto, em tela cheia. Leve o mouse até a borda de cima ou de baixo para as barras aparecerem. F ou Esc voltam ao normal.' },
      { subtitulo: 'Minha leitura' },
      {
        lista: [
          'O botão da chama, na barra de cima, abre suas estatísticas: sequência de dias, horas do mês, ritmo, livros terminados, o mapa de calor do ano e a que horas você lê.',
          '"Lendo agora" lista os livros em andamento e quanto falta para cada um. Se algum está há mais de 30 dias sem ser aberto, o Broots sugere passá-lo para Em pausa (nunca muda sozinho).',
        ],
      },
      { subtitulo: 'Status e releituras' },
      {
        lista: [
          'Os status são Para ler, Lendo, Em pausa, Lido e Abandonado, e ficam salvos no Calibre. Se a sua biblioteca não tem essa coluna, "Minha leitura" oferece criá-la: usa a ferramenta oficial do Calibre, pede sua permissão antes e faz um backup do banco de dados.',
          'Se a sua coluna já existe mas não tem "Em pausa", o Broots explica como adicionar no Calibre (as ferramentas do Calibre não permitem fazer isso de fora).',
          'Depois de 5 minutos lendo um livro "Para ler", ele passa sozinho para "Lendo" e o Broots avisa. Ao chegar à última página, o Broots oferece marcá-lo como lido.',
          'No painel de um livro lido aparece "Reler": começa uma leitura nova do início, e o que você leu antes fica guardado à parte.',
          'As sessões ficam na pasta .broots/habito da sua biblioteca. Em Configurações → Leitura e tradução você pode parar de anotá-las ou apagar as estatísticas (o Broots guarda uma cópia, por via das dúvidas).',
        ],
      },
    ],
  },
  {
    id: 'club',
    titulo: 'Clube de leitura',
    bloques: [
      { texto: 'Para conversar sobre um livro com uma inteligência artificial que leu os seus destaques. Como um clube de leitura, mas sem precisar combinar horário.' },
      {
        pasos: [
          'No painel do livro, clique em “Levar ao clube de leitura”. O Broots cria um arquivo .md com os dados do livro e seus destaques e notas (os do Kindle e os do leitor do Broots, em ordem de leitura), e abre a pasta para você.',
          'Arraste esse arquivo para o seu Projeto do Claude ou para o NotebookLM.',
          'Na primeira vez, a tela Clube de leitura explica como montar o Projeto do Claude ou a skill do Gemini: você cola as instruções e completa a parte “Quem sou eu”. Isso é feito uma vez só.',
        ],
      },
    ],
  },
  {
    id: 'familia',
    titulo: 'Família',
    bloques: [
      { texto: 'Para compartilhar livros com o pessoal de casa. Cada integrante tem a própria biblioteca dentro do Broots: os livros com a etiqueta dele (por exemplo, “Para Ana”). Cada um com a sua estante.' },
      {
        pasos: [
          'Clique no botão Família da barra (ou entre em Configurações → Família) e adicione alguém pelo nome.',
          'Marque os livros dessa pessoa: no painel de cada livro, em “Compartilhar com”, clique no nome dela. Você também pode adicionar uma biblioteca inteira de uma vez.',
          'Clique em “Atualizar cópia”. O Broots monta no seu Google Drive (pasta “Broots compartilhado”) uma cópia só com os livros dela. Sua biblioteca não é alterada.',
          'No Google Drive, compartilhe essa pasta com o e-mail da pessoa como “Leitor”. Ela vê a pasta pelo app do Drive ou com o Broots em um PC, no modo somente leitura.',
        ],
      },
      { texto: 'Se você cadastrar o endereço do Kindle da pessoa, o painel de cada livro mostra “Também para o Kindle de…”.' },
    ],
  },
  {
    id: 'duplicados',
    titulo: 'Livros repetidos',
    bloques: [
      {
        lista: [
          'Clique no botão de duplicados da barra: o Broots procura livros que aparecem duas vezes, como gêmeos separados no nascimento.',
          'Para cada caso, você escolhe qual manter. Os formatos e destaques que só o outro tinha passam para o que você mantém.',
          'O que você descarta vai para a lixeira do Calibre: se errar, dá para recuperá-lo pelo Calibre.',
        ],
      },
    ],
  },
  {
    id: 'actualizaciones',
    titulo: 'Atualizações',
    bloques: [
      { texto: 'O Broots se atualiza sozinho. Sempre que você o abre (e a cada seis horas se ele ficar aberto) ele pergunta ao GitHub se tem versão nova; se tiver, baixa sem incomodar e confere se chegou inteira.' },
      {
        lista: [
          'Quando a versão nova está pronta, aparece um aviso no meio da tela. Se você estiver lendo, ele espera você fechar o livro.',
          '“Reiniciar agora” instala em alguns segundos e abre o Broots de novo. “Mais tarde” deixa para quando você fechar o Broots.',
          'Na primeira vez que você abre a versão nova tem festa: confete, língua de sogra e o que mudou.',
          'Seus livros, suas configurações e suas chaves continuam como estavam.',
        ],
      },
      { texto: 'Em Configurações → Atualizações você pode procurar uma versão nova quando quiser, ou desligar as atualizações automáticas ou o som da festa.' },
    ],
  },
  {
    id: 'atajos',
    titulo: 'Atalhos de teclado',
    bloques: [
      {
        teclas: [
          [['/', 'Ctrl+F'], 'Ir para a busca'],
          [['Ctrl+B'], 'Mostrar ou ocultar a barra lateral'],
          [['Esc'], 'Fechar o painel, a capa ampliada ou a tela aberta'],
          [['F1'], 'Abrir esta ajuda (sim, esta mesma)'],
          [['←', '→'], 'No leitor: página anterior e seguinte'],
          [['F'], 'No leitor: modo foco (só o texto, em tela cheia)'],
          [['Ctrl+Enter'], 'No leitor: salvar a nota de um destaque'],
        ],
      },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Perguntas frequentes',
    bloques: [
      {
        preguntas: [
          [
            'Aparece “O Calibre está aberto ou ocupado”. O que eu faço?',
            'Para salvar mudanças, o Broots precisa que o Calibre não esteja usando a biblioteca. Feche o Calibre e tente de novo em alguns segundos. Se o Calibre já estava fechado, espere um pouco: às vezes o Windows ou o antivírus está verificando um arquivo recém-criado.',
          ],
          [
            'O que é a senha de app do Gmail?',
            'O Google não deixa outros programas usarem sua senha de sempre. Uma senha de app é uma chave de 16 letras só para o Broots: você a cria na sua Conta do Google (é preciso ter a verificação em duas etapas ativada) e pode apagá-la quando quiser. Configurações → Kindle e e-mail tem o botão que abre essa página.',
          ],
          [
            'Como consigo a chave do Gemini?',
            'É grátis. Entre no Google AI Studio com sua conta do Google, crie uma chave (“Create API key”), copie e cole em Configurações → Leitura e tradução. A versão gratuita tem um limite de uso por dia.',
          ],
          [
            'Onde ficam minhas chaves?',
            'A senha do Gmail e a chave do Gemini ficam criptografadas pelo Windows neste PC. O Broots nunca mais as mostra nem as envia para nenhum outro lugar.',
          ],
          [
            'Minha biblioteca está no Google Drive. Preciso tomar algum cuidado?',
            'O Broots trabalha na pasta do seu PC, e o programa do Google Drive faz o upload sozinho. Evite mudar a biblioteca em dois PCs ao mesmo tempo e, se uma mudança não aparecer no outro PC, espere o Drive terminar de sincronizar.',
          ],
          [
            'Editei o .md de um livro no Obsidian e o Broots apagou o que eu escrevi. Por quê?',
            'O Broots remonta só a parte de cima do .md (a dos seus destaques). O que você escrever abaixo da linha “Daqui para baixo é seu” fica sempre do jeito que você deixou. Se você apagou essa linha, o Broots guarda o arquivo antigo à parte, com “(antes)” no nome, e monta um novo: nada se perde.',
          ],
          [
            'O Broots remove a proteção (DRM) dos meus livros?',
            'Não. Os livros protegidos são copiados do jeito que estão e, para lê-los, você precisa do app ou do aparelho da loja onde os comprou.',
          ],
          [
            'Por que um livro não pode ser enviado para o Kindle?',
            'Pode ser um registro sem arquivo, um livro com mais de 50 MB ou um que só está em MOBI ou AZW. Nesse último caso, converta-o para EPUB pelo painel dele.',
          ],
          [
            'Fiz uma mudança sem querer. Dá para desfazer?',
            'Os livros descartados ficam na lixeira do Calibre. Além disso, antes de cada mudança o Broots salva um backup do banco de dados na pasta .broots/respaldos da sua biblioteca.',
          ],
          [
            'Ao instalar o Broots, o Windows diz “O Windows protegeu o computador”. É perigoso?',
            'Aparece porque o instalador ainda não tem assinatura digital, o selo que o Windows usa para reconhecer quem fez um programa. Se você baixou da página do Broots no GitHub, clique em “Mais informações” e depois em “Executar assim mesmo”. As atualizações automáticas são verificadas antes de serem instaladas.',
          ],
        ],
      },
    ],
  },
];
