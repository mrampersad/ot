CREATE TABLE `ot` (
  `id` int(10) unsigned NOT NULL,
  `client_id` int(10) unsigned NOT NULL,
  `client_op_id` int(10) unsigned NOT NULL,
  `op` varchar(400) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client` (`client_id`,`client_op_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8
