new ModuleFederationPlugin({
  name: 'SINA-AI-Chatbot',
  shared: {
    react: { 
      singleton: true,      // ບັງຄັບໃຫ້ມີພຽງ Version ດຽວໃນທັງໝົດ Portal
      requiredVersion: '^18.0.0', // ລະບຸ Version ທີ່ຕ້ອງການ
      eager: false          // ໃຫ້ໂຫຼດແບບ Lazy load ເພື່ອປະຫຍັດ Bundle size
    },
    'react-dom': { singleton: true }
  }
})