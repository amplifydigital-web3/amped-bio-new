import React from 'react';

const RewardPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="p-6 space-y-8">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Reward</h2>
          <p className="text-sm text-gray-500">
            Create and manage your reward program
          </p>
        </div>
      </div>

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
