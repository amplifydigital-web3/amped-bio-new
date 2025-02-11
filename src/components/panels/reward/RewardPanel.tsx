import React from 'react';

const RewardPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Reward</h2>

      <iframe
        id="iframe-npayme-reward"
        loading="lazy"
        className="holds-the-iframe"
        style={{ width: '100%', height: '800px' }}
        src={import.meta.env.VITE_REWARD_URL}
      />
    </div>
  );
};

export default RewardPanel;
