-- Grant all privileges to amped_user including the ability to create databases
GRANT ALL PRIVILEGES ON *.* TO 'amped_user'@'%' WITH GRANT OPTION;
-- Specifically grant CREATE privilege
GRANT CREATE ON *.* TO 'amped_user'@'%';
FLUSH PRIVILEGES;