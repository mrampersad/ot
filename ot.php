<?php

class ot {
	const OT_NOP = 0;
	const OT_INSERT = 1;
	const OT_DELETE = 2;

	protected $db;
	
	public function __construct() {
		$this->db = new mysqli('127.0.0.1', 'test', 'test', 'test');
	}

	public function join() {
		// return unique identifier
		return rand(0, 9999);
	}
	
	public function send($index, $client_id, $client_op_id, $op) {
		$res = $this->db->query('SELECT * FROM ot WHERE id > ' . $index . ' ORDER BY id');
		if($res === false) throw new Exception('Query failed', 500);
		
		while($row = $res->fetch_assoc()) {
			// sometimes we will be sent the same client operation
			// multiple times, if we see it, we can return immediately
			if($row['client_id'] == $client_id && $row['client_op_id'] == $client_op_id) {
				return true;
			}
			
			$row['op'] = json_decode($row['op']);
			$this->xform($row['op'], $op);
			// we throw away $row['op'] since server is authoritative
			$index = $row['id'];
		}
		
		$stmt = $this->db->prepare('INSERT INTO ot SET id=?, client_id=?, client_op_id=?, op=?');
		if($stmt === false) throw new Exception('Prepare failed', 500);
		
		$id = $index + 1;
		$op_json = json_encode($op);
		$ret = $stmt->bind_param("iiis", $id, $client_id, $client_op_id, $op_json);
		if($ret === false) throw new Exception('Bind failed', 500);
		
		$ret = $stmt->execute();
		if($ret === false) throw new Exception('Execute failed', 500);
		
		return true;
	}
	
	public function recv($index) {
		// retrieve operations after index
		$res = $this->db->query('SELECT * FROM ot WHERE id > ' . $index . ' ORDER BY id');
		
		$rows = array();
		while($row = $res->fetch_assoc()) {
			$row['id'] = (int)$row['id']; // for js comparison?
			$row['op'] = json_decode($row['op']);
			$rows[] = $row;
		}
		
		return $rows;
	}
	
	public function xform($a, $b) {
		if($a->type == self::OT_NOP && $b->type == self::OT_NOP) {
			// do nothing
		} elseif($a->type == self::OT_NOP && $b->type == self::OT_INSERT) {
			// do nothing
		} elseif($a->type == self::OT_NOP && $b->type == self::OT_DELETE) {
			// do nothing
		} elseif($a->type == self::OT_INSERT && $b->type == self::OT_NOP) {
			// do nothing
		} elseif($a->type == self::OT_INSERT && $b->type == self::OT_INSERT) {
			if($a->start < $b->start) {
				$b->start++;
			} elseif($a->start > $b->start) {
				$a->start++;
			} else {
				// tie goes to server
				$b->start++;
			}
		} elseif($a->type == self::OT_INSERT && $b->type == self::OT_DELETE) {
			if($a->start < $b->start) {
				$b->start++;
			} elseif($a->start > $b->start) {
				$a->start--;
			} else {
				// tie goes to insert
				$b->start++;
			}
		} elseif($a->type == self::OT_DELETE && $b->type == self::OT_NOP) {
			// do nothing
		} elseif($a->type == self::OT_DELETE && $b->type == self::OT_INSERT) {
			if($a->start < $b->start) {
				$b->start--;
			} elseif($a->start > $b->start) {
				$a->start++;
			} else {
				// tie goes to insert
				$a->start++;
			}
		} elseif($a->type == self::OT_DELETE && $b->type == self::OT_DELETE) {
			if($a->start < $b->start) {
				$b->start--;
			} elseif($a->start > $b->start) {
				$a->start--;
			} else {
				$a->type = self::OT_NOP;
				unset($a->start);
				
				$b->type = self::OT_NOP;
				unset($b->start);
			}
		} else {
			throw new Exception('cannot xform ' . $a->type . ', ' . $b->type, 500);
		}
	}
}

try {
	$ot = new ot();
	
	// dispatch
	if(!isset($_REQUEST['action'])) {
		throw new Exception('Action required.', 400);
	}
	
	switch($_REQUEST['action']) {
		case 'join':
			$response = $ot->join();
			break;
		case 'send':
			if(!isset($_REQUEST['index'])) { throw new Exception('Index required.', 400); }
			if(!is_numeric($_REQUEST['index'])) { throw new Exception('Numeric index required.', 400); }
			if(!is_finite($_REQUEST['index'])) { throw new Exception('Finite index required.', 400); }
			$index = $_REQUEST['index'];
			
			if(!isset($_REQUEST['client_id'])) { throw new Exception('Client ID required.', 400); }
			if(!is_numeric($_REQUEST['client_id'])) { throw new Exception('Numeric Client ID required.', 400); }
			if(!is_finite($_REQUEST['client_id'])) { throw new Exception('Finite Client ID required.', 400); }
			$client_id = $_REQUEST['client_id'];
			
			if(!isset($_REQUEST['client_op_id'])) { throw new Exception('Client OP ID required.', 400); }
			if(!is_numeric($_REQUEST['client_op_id'])) { throw new Exception('Numeric Client OP ID required.', 400); }
			if(!is_finite($_REQUEST['client_op_id'])) { throw new Exception('Finite Client OP ID required.', 400); }
			$client_op_id = $_REQUEST['client_op_id'];
			
			if(!isset($_REQUEST['op'])) { throw new Exception('Operation required.', 400); }
			$op = json_decode($_REQUEST['op']);
			if(is_null($op)) { throw new Exception('OP required.', 400); }
			
			$response = $ot->send($index, $client_id, $client_op_id, $op);
			break;
		case 'recv':
			if(!isset($_REQUEST['index'])) { throw new Exception('Index required.', 400); }
			if(!is_numeric($_REQUEST['index'])) { throw new Exception('Numeric index required.', 400); }
			if(!is_finite($_REQUEST['index'])) { throw new Exception('Finite index required.', 400); }
						
			$response = $ot->recv($_REQUEST['index']);
			break;
		default:
			throw new Exception('Action not found.', 400);
	}
	
	$result = array();
	$result['type'] = 'response';
	$result['data'] = $response;
} catch(Exception $e) {
	header('HTTP/1.0 ' . $e->getCode());
	$result = array();
	$result['type'] = 'exception';
	$result['message'] = $e->getMessage();
}

header('Content-type: application/json');
echo json_encode($result);

?>